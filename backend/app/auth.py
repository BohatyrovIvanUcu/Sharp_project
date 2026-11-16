"""Cognito ID-token verification and current user resolution."""

import json
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User
from app.services import users as users_service

bearer = HTTPBearer(auto_error=False, description="Cognito ID token")

_JWKS_TTL_SECONDS = 3600.0
_jwks_cache: dict[str, Any] = {}
_jwks_cached_at: float = 0.0
_jwks_source_snapshot: str = ""


@dataclass(frozen=True)
class Identity:
    sub: str
    email: str
    name: str | None


LOCAL_IDENTITY = Identity(sub="local-dev", email="dev@sharp.local", name="Sharp Developer")


def _clear_jwks_cache() -> None:
    global _jwks_cache, _jwks_cached_at, _jwks_source_snapshot
    _jwks_cache = {}
    _jwks_cached_at = 0.0
    _jwks_source_snapshot = ""


def _fetch_jwks() -> dict[str, Any]:
    if settings.cognito_jwks:
        jwks = json.loads(settings.cognito_jwks)
    else:
        with urllib.request.urlopen(f"{settings.cognito_issuer}/.well-known/jwks.json", timeout=5) as resp:
            jwks = json.load(resp)
    return {key["kid"]: jwt.PyJWK(key).key for key in jwks["keys"]}


def signing_keys(*, force_refresh: bool = False) -> dict[str, Any]:
    global _jwks_cache, _jwks_cached_at, _jwks_source_snapshot
    now = time.monotonic()
    source_key = f"{settings.cognito_user_pool_id}:{settings.cognito_jwks}"
    expired = (now - _jwks_cached_at) >= _JWKS_TTL_SECONDS
    if force_refresh or not _jwks_cache or expired or _jwks_source_snapshot != source_key:
        _jwks_cache = _fetch_jwks()
        _jwks_cached_at = now
        _jwks_source_snapshot = source_key
    return _jwks_cache


signing_keys.cache_clear = _clear_jwks_cache  # type: ignore[attr-defined]


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_id_token(token: str) -> Identity:
    try:
        kid = jwt.get_unverified_header(token).get("kid", "")
        key = signing_keys().get(kid)
        if key is None and not settings.cognito_jwks:
            key = signing_keys(force_refresh=True).get(kid)
        if key is None:
            raise unauthorized("Unknown signing key")
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.cognito_client_id,
            issuer=settings.cognito_issuer,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise unauthorized(f"Invalid token: {exc}") from exc

    if claims.get("token_use") != "id" or not claims.get("email") or claims.get("email_verified") is not True:
        raise unauthorized("A verified ID token with an email claim is required")

    return Identity(
        sub=claims["sub"],
        email=claims["email"].lower(),
        name=claims.get("name"),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not settings.auth_enabled:
        if settings.is_production:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Auth configuration unavailable")
        identity = LOCAL_IDENTITY
    elif credentials is None:
        raise unauthorized("Sign in required")
    else:
        identity = verify_id_token(credentials.credentials)
    return users_service.get_or_create(db, identity.sub, identity.email, identity.name)
