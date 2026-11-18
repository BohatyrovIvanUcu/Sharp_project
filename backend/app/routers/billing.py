"""Monobank Acquiring billing routes (public + AWS billing proxy internal endpoints)."""

import hmac
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import BillingInvoice, User
from app.schemas import (
    BillingInvoiceSummaryOut,
    InternalBillingRecordIn,
    InternalBillingSyncIn,
    MonobankCheckoutOut,
    MonobankConfirmIn,
    MonobankConfirmOut,
)
from app.services import monobank as monobank_service
from app.services import users as users_service

router = APIRouter(prefix="/api/billing/monobank", tags=["billing"])


def _require_internal_secret(
    x_billing_internal_secret: str | None = Header(default=None),
) -> None:
    expected = settings.billing_internal_secret
    if not expected or not hmac.compare_digest(x_billing_internal_secret or "", expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid internal billing secret.")


def _find_user_invoice(
    db: Session,
    user_id: str,
    *,
    reference: str | None = None,
    invoice_id: str | None = None,
) -> BillingInvoice | None:
    stmt = select(BillingInvoice).where(BillingInvoice.user_id == user_id)
    if invoice_id:
        return db.scalar(stmt.where(BillingInvoice.invoice_id == invoice_id))
    if reference:
        return db.scalar(stmt.where(BillingInvoice.reference == reference))
    return db.scalar(stmt.order_by(desc(BillingInvoice.created_at)).limit(1))


def _to_summary(invoice: BillingInvoice) -> BillingInvoiceSummaryOut:
    return BillingInvoiceSummaryOut(
        invoice_id=invoice.invoice_id,
        reference=invoice.reference,
        status=invoice.status,
        amount=invoice.amount,
        currency=invoice.currency,
        page_url=invoice.page_url,
        failure_reason=invoice.failure_reason,
        created_at=invoice.created_at,
        paid_at=invoice.paid_at,
    )


def _to_confirm_out(invoice: BillingInvoice, user: User, upgraded: bool) -> MonobankConfirmOut:
    return MonobankConfirmOut(
        invoice_id=invoice.invoice_id,
        reference=invoice.reference,
        status=invoice.status,
        amount=invoice.amount,
        currency=invoice.currency,
        upgraded=upgraded,
        failure_reason=invoice.failure_reason,
        user=users_service.to_user_profile_out(user),
    )


@router.post("/checkout", response_model=MonobankCheckoutOut)
def create_monobank_checkout(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonobankCheckoutOut:
    reference = f"sharp-pro-{uuid.uuid4().hex[:16]}"
    origin = monobank_service.resolve_public_origin(request.headers.get("origin"))
    redirect_url, webhook_url = monobank_service.build_checkout_urls(origin, reference)
    amount = settings.monobank_pro_amount_kopecks
    currency = settings.monobank_pro_currency

    created = monobank_service.create_invoice(
        amount=amount,
        currency=currency,
        reference=reference,
        redirect_url=redirect_url,
        webhook_url=webhook_url,
    )
    invoice = BillingInvoice(
        user_id=user.id,
        provider="monobank",
        invoice_id=str(created["invoiceId"]),
        reference=reference,
        amount=amount,
        currency=currency,
        status="created",
        page_url=str(created["pageUrl"]),
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)

    return MonobankCheckoutOut(
        invoice_id=invoice.invoice_id,
        reference=invoice.reference,
        page_url=invoice.page_url,
        amount=invoice.amount,
        currency=invoice.currency,
        status=invoice.status,
    )


@router.post("/confirm", response_model=MonobankConfirmOut)
def confirm_monobank_payment(
    payload: MonobankConfirmIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonobankConfirmOut:
    invoice = _find_user_invoice(
        db,
        user.id,
        reference=payload.reference,
        invoice_id=payload.invoice_id,
    )
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Monobank invoice found for this account.")

    if invoice.status == "success":
        current_sub = users_service.get_subscription(user)
        if current_sub.tier != "pro":
            user = users_service.update_subscription(db, user, "pro")
        return _to_confirm_out(invoice, user, True)

    remote = monobank_service.get_invoice_status(invoice.invoice_id)
    updated_inv, updated_user, upgraded = monobank_service.apply_invoice_status(
        db,
        invoice,
        new_status=str(remote.get("status") or invoice.status),
        verified_amount=int(remote["amount"]) if remote.get("amount") is not None else None,
        verified_ccy=int(remote["ccy"]) if remote.get("ccy") is not None else None,
        failure_reason=str(remote["failureReason"]) if remote.get("failureReason") else None,
    )
    return _to_confirm_out(updated_inv, updated_user, upgraded)


@router.get("/latest", response_model=BillingInvoiceSummaryOut | None)
def get_latest_invoice(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingInvoiceSummaryOut | None:
    invoice = _find_user_invoice(db, user.id)
    return _to_summary(invoice) if invoice else None


@router.post("/webhook")
async def monobank_webhook(
    request: Request,
    x_sign: str = Header(default="", alias="X-Sign"),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    payload = monobank_service.parse_verified_webhook(await request.body(), x_sign)
    invoice_id = str(payload["invoiceId"]).strip()
    invoice = db.scalar(select(BillingInvoice).where(BillingInvoice.invoice_id == invoice_id))
    if invoice is None:
        return {"ok": True}

    monobank_service.apply_invoice_status(
        db,
        invoice,
        new_status=str(payload.get("status") or invoice.status),
        verified_amount=int(payload["amount"]) if payload.get("amount") is not None else None,
        verified_ccy=int(payload["ccy"]) if payload.get("ccy") is not None else None,
        failure_reason=str(payload["failureReason"]) if payload.get("failureReason") else None,
    )
    return {"ok": True}


@router.post("/internal/record", response_model=BillingInvoiceSummaryOut, include_in_schema=False)
def internal_record_invoice(
    payload: InternalBillingRecordIn,
    _: None = Depends(_require_internal_secret),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingInvoiceSummaryOut:
    existing = db.scalar(select(BillingInvoice).where(BillingInvoice.invoice_id == payload.invoice_id))
    if existing is not None:
        if existing.user_id != user.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Invoice belongs to a different account.")
        return _to_summary(existing)

    invoice = BillingInvoice(
        user_id=user.id,
        provider="monobank",
        invoice_id=payload.invoice_id,
        reference=payload.reference,
        amount=payload.amount,
        currency=payload.currency,
        status=payload.status,
        page_url=payload.page_url,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _to_summary(invoice)


@router.get("/internal/lookup", response_model=BillingInvoiceSummaryOut, include_in_schema=False)
def internal_lookup_invoice(
    reference: str | None = Query(default=None, max_length=128),
    invoice_id: str | None = Query(default=None, max_length=128),
    _: None = Depends(_require_internal_secret),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BillingInvoiceSummaryOut:
    invoice = _find_user_invoice(db, user.id, reference=reference, invoice_id=invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No Monobank invoice found for this account.")
    return _to_summary(invoice)


@router.post("/internal/sync", response_model=MonobankConfirmOut, include_in_schema=False)
def internal_sync_invoice(
    payload: InternalBillingSyncIn,
    _: None = Depends(_require_internal_secret),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MonobankConfirmOut:
    invoice = _find_user_invoice(db, user.id, invoice_id=payload.invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found for current user.")

    updated_inv, updated_user, upgraded = monobank_service.apply_invoice_status(
        db,
        invoice,
        new_status=payload.status,
        verified_amount=payload.amount,
        verified_ccy=payload.ccy,
        failure_reason=payload.failure_reason,
    )
    return _to_confirm_out(updated_inv, updated_user, upgraded)


@router.post("/internal/webhook-sync", include_in_schema=False)
def internal_webhook_sync(
    payload: InternalBillingSyncIn,
    _: None = Depends(_require_internal_secret),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    invoice = db.scalar(select(BillingInvoice).where(BillingInvoice.invoice_id == payload.invoice_id))
    if invoice is None:
        return {"ok": True}

    monobank_service.apply_invoice_status(
        db,
        invoice,
        new_status=payload.status,
        verified_amount=payload.amount,
        verified_ccy=payload.ccy,
        failure_reason=payload.failure_reason,
    )
    return {"ok": True}
