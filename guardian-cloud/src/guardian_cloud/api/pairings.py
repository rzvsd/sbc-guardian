from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..api import deps
from ..domain import auth as auth_domain
from ..persistence import repository

router = APIRouter(prefix="/api/v2/pairings", tags=["pairings"])


class PairingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ttl_seconds: int = Field(default=600, ge=60, le=600)


class PairingResult(BaseModel):
    code: str
    expires_at: str


@router.post("", response_model=PairingResult)
def create_pairing(
    req: PairingRequest,
    account_id: str = Depends(deps.get_session_account),
    session: Session = Depends(deps.get_session),
):
    code = secrets.token_urlsafe(24)
    expires_at = datetime.now(UTC) + timedelta(seconds=req.ttl_seconds)
    pairing = repository.create_pairing(session, code, expires_at, account_id)
    return PairingResult(code=code, expires_at=pairing.expires_at.isoformat())


class ClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str


class ClaimResult(BaseModel):
    session_nonce: str
    refresh_token: str


@router.post("/claim", response_model=ClaimResult)
def claim_pairing(
    req: ClaimRequest,
    session: Session = Depends(deps.get_session),
):
    pairing = repository.claim_pairing(session, req.code)
    if not pairing.account_id:
        raise ValueError("pairing has no owner")
    raw_session = deps.make_session_nonce()
    raw_refresh = secrets.token_urlsafe(48)
    repository.create_device_session(
        session,
        pairing.account_id,
        session_nonce=raw_session,
        token_hash="",
        refresh_token_hash=auth_domain.hash_token(raw_refresh),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=deps.default_refresh_expiry(),
    )
    return ClaimResult(session_nonce=raw_session, refresh_token=raw_refresh)
