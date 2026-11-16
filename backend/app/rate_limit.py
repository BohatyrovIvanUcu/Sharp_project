"""Lightweight sliding-window rate limiter for LLM invocation endpoints."""

from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, HTTPException, Request, status

from app.auth import get_current_user
from app.config import settings
from app.models import User

_lock = Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def _monotonic_now() -> float:
    import time

    return time.monotonic()


def reset_rate_limiter() -> None:
    with _lock:
        _buckets.clear()


def limit_llm_calls(
    request: Request,
    user: User = Depends(get_current_user),
) -> None:
    if not settings.rate_limit_enabled:
        return

    window = float(max(1, settings.rate_limit_window_seconds))
    limit = max(1, settings.rate_limit_llm_requests)
    client_ip = request.client.host if request.client else "unknown"
    key = f"llm:{user.id}:{client_ip}"
    now = _monotonic_now()
    cutoff = now - window

    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(bucket[0] + window - now))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many AI requests. Please wait before retrying.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
