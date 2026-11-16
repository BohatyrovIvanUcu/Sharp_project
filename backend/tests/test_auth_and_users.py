import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import auth
from app.config import settings
from app.models import User, default_cognitive_profile
from app.services import users as users_service


def _rsa_keypair_and_jwks(kid: str = "test-kid-1") -> tuple[rsa.RSAPrivateKey, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk_dict = jwt.algorithms.RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True)
    jwk_dict["kid"] = kid
    jwk_dict["use"] = "sig"
    jwk_dict["alg"] = "RS256"
    return private_key, json.dumps({"keys": [jwk_dict]})


def test_cognito_auth_verifies_id_token_and_rejects_invalid(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_key, jwks_json = _rsa_keypair_and_jwks()
    pool_id = "us-east-1_TestPool1"
    client_id = "test-client-123"
    issuer = f"https://cognito-idp.us-east-1.amazonaws.com/{pool_id}"

    monkeypatch.setattr(settings, "cognito_region", "us-east-1")
    monkeypatch.setattr(settings, "cognito_user_pool_id", pool_id)
    monkeypatch.setattr(settings, "cognito_client_id", client_id)
    monkeypatch.setattr(settings, "cognito_jwks", jwks_json)
    auth.signing_keys.cache_clear()

    try:
        unauth = client.get("/api/me")
        assert unauth.status_code == 401

        now = int(time.time())
        id_token = jwt.encode(
            {
                "sub": "cognito-sub-42",
                "email": "Tester@Example.com",
                "email_verified": True,
                "name": "Tester",
                "aud": client_id,
                "iss": issuer,
                "token_use": "id",
                "iat": now,
                "exp": now + 300,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "test-kid-1"},
        )
        ok_resp = client.get("/api/me", headers={"Authorization": f"Bearer {id_token}"})
        assert ok_resp.status_code == 200
        body = ok_resp.json()
        assert body["email"] == "tester@example.com"
        assert body["name"] == "Tester"
        assert body["auth_enabled"] is True

        unverified_token = jwt.encode(
            {
                "sub": "cognito-sub-42",
                "email": "Tester@Example.com",
                "email_verified": False,
                "aud": client_id,
                "iss": issuer,
                "token_use": "id",
                "iat": now,
                "exp": now + 300,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "test-kid-1"},
        )
        assert (
            client.get("/api/me", headers={"Authorization": f"Bearer {unverified_token}"}).status_code == 401
        )

        access_token = jwt.encode(
            {
                "sub": "cognito-sub-42",
                "email": "tester@example.com",
                "email_verified": True,
                "aud": client_id,
                "iss": issuer,
                "token_use": "access",
                "iat": now,
                "exp": now + 300,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "test-kid-1"},
        )
        bad_use = client.get("/api/me", headers={"Authorization": f"Bearer {access_token}"})
        assert bad_use.status_code == 401
    finally:
        auth.signing_keys.cache_clear()


def test_get_or_create_recovers_from_concurrent_integrity_error(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = User(
        cognito_sub="race-sub-1",
        email="race@example.com",
        name="Race User",
        cognitive_profile=default_cognitive_profile(),
    )
    db_session.add(existing)
    db_session.commit()

    calls = 0
    original_find = users_service._find_user

    def find_missing_first(db: Session, cognito_sub: str, email: str) -> User | None:
        nonlocal calls
        calls += 1
        if calls == 1:
            return None
        return original_find(db, cognito_sub, email)

    original_commit = db_session.commit

    def fail_first_commit() -> None:
        raise IntegrityError("INSERT INTO users", {}, Exception("duplicate key"))

    monkeypatch.setattr(users_service, "_find_user", find_missing_first)
    monkeypatch.setattr(db_session, "commit", fail_first_commit)

    resolved = users_service.get_or_create(db_session, "race-sub-1", "race@example.com", "Race User")
    monkeypatch.setattr(db_session, "commit", original_commit)
    assert resolved.id == existing.id
    assert calls == 2


def test_get_or_create_rejects_sub_mismatch_for_existing_email(db_session: Session) -> None:
    from fastapi import HTTPException

    existing = User(
        cognito_sub="victim-sub-1",
        email="victim@example.com",
        name="Victim",
        cognitive_profile=default_cognitive_profile(),
    )
    db_session.add(existing)
    db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        users_service.get_or_create(db_session, "attacker-sub-2", "victim@example.com", "Attacker")
    assert exc_info.value.status_code == 409
    db_session.refresh(existing)
    assert existing.cognito_sub == "victim-sub-1"


def test_production_settings_require_cognito() -> None:
    from app.config import Settings

    with pytest.raises(RuntimeError, match="Production environment requires Cognito"):
        Settings(environment="production", cognito_user_pool_id="", cognito_client_id="")


def test_origin_verify_secret_and_scrubbed_health(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    assert health_resp.json() == {"status": "ok"}
    assert health_resp.headers["x-content-type-options"] == "nosniff"
    assert health_resp.headers["x-frame-options"] == "DENY"

    monkeypatch.setattr(settings, "origin_verify_secret", "super-secret-origin-token")
    blocked = client.get("/api/health")
    assert blocked.status_code == 403
    allowed = client.get("/api/health", headers={"X-Origin-Verify": "super-secret-origin-token"})
    assert allowed.status_code == 200
