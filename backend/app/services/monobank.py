"""Monobank Acquiring API client, ECDSA webhook verification, and billing sync helpers."""

import base64
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import BillingInvoice, User, utcnow
from app.services import users as users_service

_PUBKEY_TTL_SECONDS = 3600.0
_pubkey_cache: bytes | None = None
_pubkey_cached_at: float = 0.0
_pubkey_token_snapshot: str = ""

_CLOUDFRONT_ORIGIN_RE = re.compile(r"^https://[a-z0-9-]+\.cloudfront\.net$")


def clear_pubkey_cache() -> None:
    global _pubkey_cache, _pubkey_cached_at, _pubkey_token_snapshot
    _pubkey_cache = None
    _pubkey_cached_at = 0.0
    _pubkey_token_snapshot = ""


def _monobank_request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    token = settings.monobank_api_token.strip()
    if not token:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Monobank acquiring token is not configured.",
        )

    base_url = settings.monobank_api_base_url.rstrip("/")
    url = f"{base_url}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "X-Token": token,
        "Accept": "application/json",
        "User-Agent": "SharpApp/1.0",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8")
            parsed = json.loads(raw)
            if not isinstance(parsed, dict):
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unexpected Monobank API response format.")
            return parsed
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")[:300]
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Monobank API returned HTTP {exc.code}: {err_body}",
        ) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Failed to communicate with Monobank API: {exc}",
        ) from exc


def resolve_public_origin(request_origin: str | None) -> str:
    candidate = (request_origin or "").strip().rstrip("/")
    app_origin = settings.app_url.strip().rstrip("/")

    if candidate:
        if app_origin and candidate == app_origin:
            return candidate
        if _CLOUDFRONT_ORIGIN_RE.fullmatch(candidate):
            return candidate
        if not settings.is_production and candidate in {o.rstrip("/") for o in settings.cors_origin_list}:
            return candidate

    if app_origin:
        return app_origin
    if not settings.is_production and settings.cors_origin_list:
        return settings.cors_origin_list[0].rstrip("/")

    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        "Could not determine a valid redirect origin for Monobank checkout.",
    )


def build_checkout_urls(origin: str, reference: str) -> tuple[str, str | None]:
    redirect_url = f"{origin}/?billing=monobank&ref={urllib.parse.quote(reference, safe='')}"
    webhook_url = f"{origin}/api/billing/monobank/webhook" if origin.startswith("https://") else None
    return redirect_url, webhook_url


def create_invoice(
    *,
    amount: int,
    currency: int,
    reference: str,
    redirect_url: str,
    webhook_url: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "amount": amount,
        "ccy": currency,
        "redirectUrl": redirect_url,
        "validity": 3600,
        "paymentType": "debit",
        "merchantPaymInfo": {
            "reference": reference,
            "destination": "Підписка Sharp Pro (1 місяць)",
            "comment": "Sharp Pro — AI Audio Coach, Video Walkthrough та розширені ліміти",
        },
    }
    if webhook_url:
        payload["webHookUrl"] = webhook_url

    res = _monobank_request("POST", "/api/merchant/invoice/create", payload)
    if not res.get("invoiceId") or not res.get("pageUrl"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Monobank did not return invoiceId and pageUrl.")
    return res


def get_invoice_status(invoice_id: str) -> dict[str, Any]:
    encoded = urllib.parse.quote(invoice_id, safe="")
    return _monobank_request("GET", f"/api/merchant/invoice/status?invoiceId={encoded}")


def get_public_key(*, force_refresh: bool = False) -> bytes:
    global _pubkey_cache, _pubkey_cached_at, _pubkey_token_snapshot
    now = time.monotonic()
    token = settings.monobank_api_token.strip()
    expired = (now - _pubkey_cached_at) >= _PUBKEY_TTL_SECONDS
    if force_refresh or _pubkey_cache is None or expired or _pubkey_token_snapshot != token:
        res = _monobank_request("GET", "/api/merchant/pubkey")
        key_b64 = res.get("key")
        if not isinstance(key_b64, str) or not key_b64.strip():
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Monobank did not return a valid public key.")
        try:
            pem_bytes = base64.b64decode(key_b64)
        except Exception as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                f"Invalid Monobank public key encoding: {exc}",
            ) from exc
        _pubkey_cache = pem_bytes
        _pubkey_cached_at = now
        _pubkey_token_snapshot = token
    return _pubkey_cache


def verify_webhook_signature(raw_body: bytes, x_sign_b64: str) -> bool:
    if not x_sign_b64 or not x_sign_b64.strip():
        return False
    try:
        signature = base64.b64decode(x_sign_b64.strip(), validate=True)
    except Exception:
        return False

    for refresh in (False, True):
        pem_bytes = get_public_key(force_refresh=refresh)
        try:
            public_key = serialization.load_pem_public_key(pem_bytes)
            if not isinstance(public_key, ec.EllipticCurvePublicKey):
                return False
            public_key.verify(signature, raw_body, ec.ECDSA(hashes.SHA256()))
            return True
        except InvalidSignature:
            continue
        except Exception:
            return False
    return False


def parse_verified_webhook(raw_body: bytes, x_sign: str) -> dict[str, Any]:
    if not verify_webhook_signature(raw_body, x_sign):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Monobank webhook signature.")
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed webhook JSON.") from exc
    if not isinstance(payload, dict) or not str(payload.get("invoiceId") or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing invoiceId in webhook.")
    return payload


def apply_invoice_status(
    db: Session,
    invoice: BillingInvoice,
    *,
    new_status: str,
    verified_amount: int | None = None,
    verified_ccy: int | None = None,
    failure_reason: str | None = None,
) -> tuple[BillingInvoice, User, bool]:
    clean_status = new_status.strip().lower()[:32]
    if clean_status == "success":
        if verified_amount is not None and verified_amount < invoice.amount:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Verified invoice amount is lower than required.",
            )
        if verified_ccy is not None and verified_ccy != invoice.currency:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verified invoice currency mismatch.")
        invoice.status = "success"
        invoice.failure_reason = None
        if invoice.paid_at is None:
            invoice.paid_at = utcnow()
        invoice.updated_at = utcnow()
        user = users_service.update_subscription(db, invoice.user, "pro")
        db.refresh(invoice)
        return invoice, user, True

    invoice.status = clean_status
    if failure_reason:
        invoice.failure_reason = failure_reason[:500]
    invoice.updated_at = utcnow()
    db.commit()
    db.refresh(invoice)
    return invoice, invoice.user, False
