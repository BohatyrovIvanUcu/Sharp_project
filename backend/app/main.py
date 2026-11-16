import hmac

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import frameworks, health, memory, sessions, users

app = FastAPI(
    title="Sharp API",
    description="Dehumanized cognitive AI anti-procrastination workspace",
    version="0.1.0",
    docs_url=None if settings.is_production else "/api/docs",
    openapi_url=None if settings.is_production else "/api/openapi.json",
)


@app.middleware("http")
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
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(users.router)
app.include_router(frameworks.router)
app.include_router(sessions.router)
app.include_router(memory.router)
