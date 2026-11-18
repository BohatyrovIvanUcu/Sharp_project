import base64
import json

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import billing_proxy_handler
from app.config import settings
from app.models import BillingInvoice
from app.services import monobank as monobank_service


def _ecdsa_keypair() -> tuple[ec.EllipticCurvePrivateKey, str]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    pub_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_key, base64.b64encode(pub_pem).decode("ascii")


def test_monobank_checkout_and_confirm_upgrades_user_to_pro(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "monobank_api_token", "")
    missing_resp = client.post("/api/billing/monobank/checkout")
    assert missing_resp.status_code == 503

    monkeypatch.setattr(settings, "monobank_api_token", "test-mono-token")
    monkeypatch.setattr(settings, "cors_origins", "http://localhost:3000,http://localhost:5173")
    monkeypatch.setattr(settings, "app_url", "")
    captured_requests: list[tuple[str, str, dict | None]] = []

    def fake_monobank_request(method: str, path: str, payload: dict | None = None) -> dict:
        captured_requests.append((method, path, payload))
        if path == "/api/merchant/invoice/create":
            return {
                "invoiceId": "mono_inv_001",
                "pageUrl": "https://pay.monobank.ua/mono_inv_001",
            }
        if path.startswith("/api/merchant/invoice/status"):
            return {
                "invoiceId": "mono_inv_001",
                "status": "success",
                "amount": 99900,
                "ccy": 980,
            }
        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(monobank_service, "_monobank_request", fake_monobank_request)

    # Spoofed evil origin is ignored in favor of safe fallback origin
    checkout_resp = client.post(
        "/api/billing/monobank/checkout",
        headers={"Origin": "https://evil.example.com"},
    )
    assert checkout_resp.status_code == 200
    checkout = checkout_resp.json()
    assert checkout["invoice_id"] == "mono_inv_001"
    assert checkout["page_url"] == "https://pay.monobank.ua/mono_inv_001"
    assert checkout["amount"] == 99900
    assert checkout["currency"] == 980

    _, create_path, create_payload = captured_requests[0]
    assert create_path == "/api/merchant/invoice/create"
    assert create_payload is not None
    assert create_payload["amount"] == 99900
    assert create_payload["ccy"] == 980
    assert "evil.example.com" not in create_payload["redirectUrl"]
    assert create_payload["redirectUrl"].startswith("http://localhost:3000/?billing=monobank&ref=")
    assert "webHookUrl" not in create_payload

    # Confirm payment via invoice status check
    confirm_resp = client.post(
        "/api/billing/monobank/confirm",
        json={"reference": checkout["reference"]},
    )
    assert confirm_resp.status_code == 200
    confirmed = confirm_resp.json()
    assert confirmed["status"] == "success"
    assert confirmed["upgraded"] is True
    assert confirmed["user"]["subscription"]["tier"] == "pro"
    assert confirmed["user"]["subscription"]["audio_coach_enabled"] is True
    assert confirmed["user"]["subscription"]["video_explainer_enabled"] is True

    latest = client.get("/api/billing/monobank/latest").json()
    assert latest["invoice_id"] == "mono_inv_001"
    assert latest["status"] == "success"
    stored_invoice = db_session.scalar(
        select(BillingInvoice).where(BillingInvoice.invoice_id == "mono_inv_001")
    )
    assert stored_invoice is not None


def test_monobank_checkout_sets_webhook_for_cloudfront_origin(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "monobank_api_token", "test-mono-token")
    captured: list[dict] = []

    def fake_monobank_request(method: str, path: str, payload: dict | None = None) -> dict:
        if payload:
            captured.append(payload)
        return {"invoiceId": "mono_cf_1", "pageUrl": "https://pay.monobank.ua/mono_cf_1"}

    monkeypatch.setattr(monobank_service, "_monobank_request", fake_monobank_request)

    resp = client.post(
        "/api/billing/monobank/checkout",
        headers={"Origin": "https://d9udlpfa0ugsf.cloudfront.net"},
    )
    assert resp.status_code == 200
    assert captured[0]["redirectUrl"].startswith(
        "https://d9udlpfa0ugsf.cloudfront.net/?billing=monobank&ref="
    )
    assert captured[0]["webHookUrl"] == "https://d9udlpfa0ugsf.cloudfront.net/api/billing/monobank/webhook"


def test_monobank_webhook_ecdsa_verification_and_amount_tamper_guard(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "monobank_api_token", "test-mono-token")
    monobank_service.clear_pubkey_cache()
    private_key, pub_key_b64 = _ecdsa_keypair()

    def fake_monobank_request(method: str, path: str, payload: dict | None = None) -> dict:
        if path == "/api/merchant/invoice/create":
            return {"invoiceId": "mono_wh_1", "pageUrl": "https://pay.monobank.ua/mono_wh_1"}
        if path == "/api/merchant/pubkey":
            return {"key": pub_key_b64}
        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(monobank_service, "_monobank_request", fake_monobank_request)

    checkout = client.post("/api/billing/monobank/checkout").json()
    webhook_body = json.dumps(
        {
            "invoiceId": checkout["invoice_id"],
            "status": "success",
            "amount": 99900,
            "ccy": 980,
            "reference": checkout["reference"],
        }
    ).encode("utf-8")

    # Reject invalid / missing signature
    bad_wh = client.post(
        "/api/billing/monobank/webhook",
        content=webhook_body,
        headers={"Content-Type": "application/json", "X-Sign": "bm90LXZhbGlk"},
    )
    assert bad_wh.status_code == 401

    # Valid ECDSA signature upgrades user
    signature = private_key.sign(webhook_body, ec.ECDSA(hashes.SHA256()))
    x_sign = base64.b64encode(signature).decode("ascii")
    ok_wh = client.post(
        "/api/billing/monobank/webhook",
        content=webhook_body,
        headers={"Content-Type": "application/json", "X-Sign": x_sign},
    )
    assert ok_wh.status_code == 200
    assert ok_wh.json() == {"ok": True}

    me = client.get("/api/me").json()
    assert me["subscription"]["tier"] == "pro"
    assert me["subscription"]["video_explainer_enabled"] is True

    # Underpaid webhook is rejected cleanly
    underpaid_body = json.dumps(
        {
            "invoiceId": checkout["invoice_id"],
            "status": "success",
            "amount": 100,
            "ccy": 980,
        }
    ).encode("utf-8")
    underpaid_sig = base64.b64encode(private_key.sign(underpaid_body, ec.ECDSA(hashes.SHA256()))).decode(
        "ascii"
    )
    underpaid_resp = client.post(
        "/api/billing/monobank/webhook",
        content=underpaid_body,
        headers={"Content-Type": "application/json", "X-Sign": underpaid_sig},
    )
    assert underpaid_resp.status_code == 400


def test_internal_billing_secret_and_proxy_flow(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "billing_internal_secret", "internal-secret-123")
    monkeypatch.setattr(settings, "monobank_api_token", "test-mono-token")
    monobank_service.clear_pubkey_cache()
    private_key, pub_key_b64 = _ecdsa_keypair()

    # Forbidden without matching internal secret
    denied = client.post(
        "/api/billing/monobank/internal/record",
        json={
            "invoice_id": "inv_x",
            "reference": "ref_x",
            "amount": 99900,
            "currency": 980,
            "status": "created",
            "page_url": "https://pay.monobank.ua/inv_x",
        },
    )
    assert denied.status_code == 403

    def fake_monobank_request(method: str, path: str, payload: dict | None = None) -> dict:
        if path == "/api/merchant/invoice/create":
            return {"invoiceId": "mono_proxy_1", "pageUrl": "https://pay.monobank.ua/mono_proxy_1"}
        if path.startswith("/api/merchant/invoice/status"):
            return {"invoiceId": "mono_proxy_1", "status": "success", "amount": 99900, "ccy": 980}
        if path == "/api/merchant/pubkey":
            return {"key": pub_key_b64}
        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(monobank_service, "_monobank_request", fake_monobank_request)

    # Bridge proxy internal HTTP calls directly into FastAPI TestClient
    def fake_call_internal(
        method: str,
        path: str,
        *,
        auth_header: str = "",
        payload: dict | None = None,
    ) -> dict:
        headers = {"X-Billing-Internal-Secret": "internal-secret-123"}
        if auth_header:
            headers["Authorization"] = auth_header
        resp = client.request(method, path, json=payload, headers=headers)
        assert resp.status_code == 200, resp.text
        return resp.json()

    monkeypatch.setattr(billing_proxy_handler, "_call_internal_backend", fake_call_internal)

    proxy_client = TestClient(billing_proxy_handler.proxy_app)
    co = proxy_client.post(
        "/api/billing/monobank/checkout",
        headers={"Origin": "https://d9udlpfa0ugsf.cloudfront.net"},
    )
    assert co.status_code == 200
    ref = co.json()["reference"]

    wh_body = json.dumps(
        {"invoiceId": "mono_proxy_1", "status": "success", "amount": 99900, "ccy": 980}
    ).encode("utf-8")
    wh_sig = base64.b64encode(private_key.sign(wh_body, ec.ECDSA(hashes.SHA256()))).decode("ascii")
    wh_res = proxy_client.post(
        "/api/billing/monobank/webhook",
        content=wh_body,
        headers={"Content-Type": "application/json", "X-Sign": wh_sig},
    )
    assert wh_res.status_code == 200

    conf = proxy_client.post("/api/billing/monobank/confirm", json={"reference": ref})
    assert conf.status_code == 200
    assert conf.json()["upgraded"] is True
    assert conf.json()["user"]["subscription"]["tier"] == "pro"
