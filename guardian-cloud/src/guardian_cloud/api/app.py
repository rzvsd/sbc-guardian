from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from ..adapters.provider_clients import Auth0HttpClient, StripeHttpAdapter
from ..config import is_production
from ..persistence.repository import ConflictError, OwnershipError
from . import deps
from .access import router as access_router
from .account import router as account_router
from .admin import router as admin_router
from .auth import router as auth_router
from .billing import router as billing_router
from .device_sessions import router as device_sessions_router
from .health import router as health_router
from .pairings import router as pairings_router
from .policy import router as policy_router
from .privacy import router as privacy_router
from .requirements_router import router as requirements_router
from .scoring_router import router as scoring_router
from .snapshots import router as snapshots_router
from .solutions import router as solutions_router
from .solve import router as solve_router


def create_app() -> FastAPI:
    if deps.auth0_client is None:
        deps.set_auth0_client(Auth0HttpClient.from_environment())
    if deps.stripe_adapter is None:
        deps.set_stripe_adapter(StripeHttpAdapter.from_environment())
    docs_url = None if is_production() else "/docs"
    app = FastAPI(
        title="Guardian Cloud v2",
        version="26.10.0",
        docs_url=docs_url,
        redoc_url=None if is_production() else "/redoc",
        openapi_url=None if is_production() else "/openapi.json",
    )

    # Fail-closed ownership boundary: missing AND foreign resources are
    # indistinguishable (404). Conflicts (e.g. overlapping consumption) are 409.
    @app.exception_handler(OwnershipError)
    def _ownership_handler(_: Request, __: OwnershipError):
        return JSONResponse(status_code=404, content={"detail": "resource not found"})

    @app.exception_handler(ConflictError)
    def _conflict_handler(_: Request, exc: ConflictError):
        return JSONResponse(status_code=409, content={"detail": str(exc) or "conflict"})

    @app.exception_handler(ValueError)
    def _value_handler(_: Request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": str(exc) or "invalid request"})

    app.include_router(health_router)
    app.include_router(access_router)
    app.include_router(snapshots_router)
    app.include_router(policy_router)
    app.include_router(requirements_router)
    app.include_router(solve_router)
    app.include_router(solutions_router)
    app.include_router(scoring_router)
    app.include_router(account_router)
    app.include_router(privacy_router)
    app.include_router(auth_router)
    app.include_router(pairings_router)
    app.include_router(device_sessions_router)
    app.include_router(admin_router)
    app.include_router(billing_router)
    return app


app = create_app()
