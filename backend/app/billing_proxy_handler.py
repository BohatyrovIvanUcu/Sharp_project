"""Internet-connected non-VPC AWS Lambda entrypoint for Monobank Acquiring calls."""

import hmac
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from mangum import Mangum

from app.auth import bearer, unauthorized, verify_id_token
from app.config import settings
from app.schemas import MonobankCheckoutOut, MonobankConfirmIn, MonobankConfirmOut
from app.services import monobank as monobank_service

proxy_app = FastAPI(title="Sharp Monobank Billing Proxy", docs_url=None, openapi_url=None)


@proxy_app.middleware("http")
async def security_edge_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    expected_secret = settings.origin_verify_secret
    if expected_secret:
        provided = request.headers.get("x-origin-verify", "")
        if not hmac.compare_digest(provided, expected_secret):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Direct origin access forbidden"},
            )

    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


proxy_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _require_bearer_header(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not settings.auth_enabled:
        if settings.is_production:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Auth configuration unavailable")
        return ""
    if credentials is None:
        raise unauthorized("Sign in required")
    verify_id_token(credentials.credentials)
    return f"Bearer {credentials.credentials}"


def _call_internal_backend(
    method: str,
    path: str,
    *,
    auth_header: str = "",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base_url = settings.backend_internal_url.strip().rstrip("/")
    if not base_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Backend internal URL is not configured.")

    headers: dict[str, str] = {
        "Accept": "application/json",
        "X-Origin-Verify": settings.origin_verify_secret,
        "X-Billing-Internal-Secret": settings.billing_internal_secret,
    }
    if auth_header:
        headers["Authorization"] = auth_header

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_raw = exc.read().decode("utf-8", errors="replace")
        detail = err_raw[:300]
        try:
            parsed = json.loads(err_raw)
            if isinstance(parsed, dict) and isinstance(parsed.get("detail"), str):
                detail = parsed["detail"]
        except json.JSONDecodeError:
            pass
        raise HTTPException(exc.code, detail) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Backend billing sync failed: {exc}") from exc


@proxy_app.post("/api/billing/monobank/checkout", response_model=MonobankCheckoutOut)
def proxy_checkout(
    request: Request,
    auth_header: str = Depends(_require_bearer_header),
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
    invoice_id = str(created["invoiceId"])
    page_url = str(created["pageUrl"])

    _call_internal_backend(
        "POST",
        "/api/billing/monobank/internal/record",
        auth_header=auth_header,
        payload={
            "invoice_id": invoice_id,
            "reference": reference,
            "amount": amount,
            "currency": currency,
            "status": "created",
            "page_url": page_url,
        },
    )
    return MonobankCheckoutOut(
        invoice_id=invoice_id,
        reference=reference,
        page_url=page_url,
        amount=amount,
        currency=currency,
        status="created",
    )


@proxy_app.post("/api/billing/monobank/confirm", response_model=MonobankConfirmOut)
def proxy_confirm(
    payload: MonobankConfirmIn,
    auth_header: str = Depends(_require_bearer_header),
) -> MonobankConfirmOut:
    query_params: dict[str, str] = {}
    if payload.reference:
        query_params["reference"] = payload.reference
    if payload.invoice_id:
        query_params["invoice_id"] = payload.invoice_id
    qs = f"?{urllib.parse.urlencode(query_params)}" if query_params else ""

    lookup = _call_internal_backend(
        "GET",
        f"/api/billing/monobank/internal/lookup{qs}",
        auth_header=auth_header,
    )
    invoice_id = str(lookup["invoice_id"])

    if lookup.get("status") == "success":
        synced = _call_internal_backend(
            "POST",
            "/api/billing/monobank/internal/sync",
            auth_header=auth_header,
            payload={
                "invoice_id": invoice_id,
                "status": "success",
                "amount": lookup.get("amount"),
                "ccy": lookup.get("currency"),
                "reference": lookup.get("reference"),
            },
        )
        return MonobankConfirmOut.model_validate(synced)

    remote = monobank_service.get_invoice_status(invoice_id)
    synced = _call_internal_backend(
        "POST",
        "/api/billing/monobank/internal/sync",
        auth_header=auth_header,
        payload={
            "invoice_id": invoice_id,
            "status": str(remote.get("status") or lookup.get("status") or "created"),
            "amount": int(remote["amount"]) if remote.get("amount") is not None else None,
            "ccy": int(remote["ccy"]) if remote.get("ccy") is not None else None,
            "reference": str(remote["reference"]) if remote.get("reference") else None,
            "failure_reason": str(remote["failureReason"]) if remote.get("failureReason") else None,
        },
    )
    return MonobankConfirmOut.model_validate(synced)


@proxy_app.post("/api/billing/monobank/webhook")
async def proxy_webhook(
    request: Request,
    x_sign: str = Header(default="", alias="X-Sign"),
) -> dict[str, bool]:
    payload = monobank_service.parse_verified_webhook(await request.body(), x_sign)
    invoice_id = str(payload["invoiceId"]).strip()

    _call_internal_backend(
        "POST",
        "/api/billing/monobank/internal/webhook-sync",
        payload={
            "invoice_id": invoice_id,
            "status": str(payload.get("status") or "created"),
            "amount": int(payload["amount"]) if payload.get("amount") is not None else None,
            "ccy": int(payload["ccy"]) if payload.get("ccy") is not None else None,
            "reference": str(payload["reference"]) if payload.get("reference") else None,
            "failure_reason": str(payload["failureReason"]) if payload.get("failureReason") else None,
        },
    )
    return {"ok": True}


handler = Mangum(proxy_app, lifespan="off")
