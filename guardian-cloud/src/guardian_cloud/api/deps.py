from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session, sessionmaker

from ..config import get_database_url
from ..domain import access as access_domain
from ..persistence import repository
from ..persistence.engine import make_engine

engine = make_engine(get_database_url())
SessionLocal = sessionmaker(bind=engine, future=True, autoflush=False)

# Injectable external clients (set at app bootstrap; overridden in tests).
auth0_client = None
stripe_adapter = None


def set_auth0_client(client) -> None:
    global auth0_client
    auth0_client = client


def set_stripe_adapter(adapter) -> None:
    global stripe_adapter
    stripe_adapter = adapter


def get_session() -> Iterator[Session]:
    """Request-scoped transaction.

    Commits exactly once on a successful mutating request, rolls back on any
    exception, and always closes the session. Read-only requests (no open
    transaction) do not manufacture a commit."""
    with SessionLocal() as session:
        try:
            yield session
            if session.is_active and session.in_transaction():
                session.commit()
        except Exception:
            session.rollback()
            raise


def get_session_account(
    x_guardian_session: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> str:
    """Resolve the account from a device-session nonce. Server is the source of truth.

    The account identity is NEVER taken from a client-supplied account header."""
    if not x_guardian_session:
        raise HTTPException(status_code=401, detail="missing session")
    valid = repository.get_valid_session(session, x_guardian_session)
    if valid is None:
        raise HTTPException(status_code=401, detail="invalid or revoked session")
    account = repository.get_account(session, valid.account_id)
    if account is None or account.status != "ACTIVE":
        raise HTTPException(status_code=401, detail="inactive account")
    return valid.account_id


def require_admin(
    x_guardian_session: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> str:
    if not x_guardian_session:
        raise HTTPException(status_code=401, detail="missing session")
    valid = repository.get_valid_session(session, x_guardian_session)
    if valid is None:
        raise HTTPException(status_code=401, detail="invalid or revoked session")
    account = repository.get_account(session, valid.account_id)
    if account is None or account.status != "ACTIVE":
        raise HTTPException(status_code=401, detail="inactive account")
    if not access_domain.is_admin(account.role):
        raise HTTPException(status_code=403, detail="admin role required")
    return account.id


def require_principal(
    account_id: str = Depends(get_session_account),
    session: Session = Depends(get_session),
) -> str:
    account = repository.get_account(session, account_id)
    if account is None or account.role != access_domain.ACCOUNT_ROLE_PRINCIPAL_ADMIN:
        raise HTTPException(status_code=403, detail="principal admin role required")
    return account_id


def require_product_access(
    account_id: str = Depends(get_session_account),
    session: Session = Depends(get_session),
) -> str:
    account = repository.get_account(session, account_id)
    entitlement = repository.get_latest_entitlement(session, account_id)
    level = access_domain.compute_access(
        account.role if account else "SUBSCRIBER",
        entitlement.state if entitlement else None,
        entitlement.until if entitlement else None,
    )
    if level == access_domain.ACCESS_PAYWALL:
        raise HTTPException(
            status_code=403,
            detail={"code": "ENTITLEMENT_REQUIRED", "message": "Premium access required"},
        )
    return account_id


def make_session_nonce() -> str:
    import secrets

    return secrets.token_urlsafe(32)


def default_session_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(hours=1)


def default_refresh_expiry() -> datetime:
    return datetime.now(UTC) + timedelta(days=30)
