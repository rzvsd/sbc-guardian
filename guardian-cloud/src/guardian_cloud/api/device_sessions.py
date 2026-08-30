from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..api import deps
from ..domain import auth as auth_domain
from ..persistence import repository

router = APIRouter(prefix="/api/v2/device-sessions", tags=["device-sessions"])


class RefreshResult(BaseModel):
    session_nonce: str
    refresh_token: str


@router.post("/refresh", response_model=RefreshResult)
def refresh(
    x_guardian_refresh: str | None = Header(default=None),
    session: Session = Depends(deps.get_session),
):
    old = repository.get_valid_refresh_session(session, x_guardian_refresh or "")
    if old is None:
        raise HTTPException(status_code=401, detail="invalid session")
    raw_session = deps.make_session_nonce()
    raw_refresh = secrets_refresh_token()
    repository.rotate_device_session(
        session,
        old.id,
        session_nonce=raw_session,
        token_hash=auth_domain.hash_token(secrets_refresh_token()),
        refresh_token_hash=auth_domain.hash_token(raw_refresh),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=old.refresh_expires_at,
    )
    return RefreshResult(session_nonce=raw_session, refresh_token=raw_refresh)


@router.post("/revoke")
def revoke(
    x_guardian_session: str | None = Header(default=None),
    session: Session = Depends(deps.get_session),
):
    valid = repository.get_valid_session(session, x_guardian_session or "")
    if valid is not None:
        repository.revoke_device_session(session, valid.id)
        repository.revoke_pending_pairings(session, valid.account_id)
    return {"ok": True}


def secrets_refresh_token() -> str:
    import secrets

    return secrets.token_urlsafe(32)
