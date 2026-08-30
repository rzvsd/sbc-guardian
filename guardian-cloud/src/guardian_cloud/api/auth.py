from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..api import deps
from ..domain import access as access_domain
from ..domain import auth as auth_domain
from ..persistence import repository

router = APIRouter(prefix="/api/v2/auth", tags=["auth"])


class CallbackResult(BaseModel):
    session_nonce: str
    account_id: str
    role: str
    access: str
    refresh_token: str


class LoginResult(BaseModel):
    authorize_url: str
    state: str
    code_verifier: str


@router.get("/login", response_model=LoginResult)
def login(session: Session = Depends(deps.get_session)):
    if deps.auth0_client is None:
        raise HTTPException(status_code=503, detail="auth not configured")
    verifier, challenge = auth_domain.generate_pkce()
    state = secrets.token_urlsafe(32)
    repository.create_auth_transaction(
        session, state, challenge, datetime.now(UTC) + timedelta(minutes=10)
    )
    authorize_url = deps.auth0_client.authorize_url(state=state, code_challenge=challenge)
    return LoginResult(authorize_url=authorize_url, state=state, code_verifier=verifier)


@router.get("/callback", response_model=CallbackResult)
def callback(
    code: str,
    state: str,
    code_verifier: str,
    response: Response,
    session: Session = Depends(deps.get_session),
):
    if deps.auth0_client is None:
        raise HTTPException(status_code=503, detail="auth not configured")
    txn = repository.consume_auth_transaction(session, state)
    if txn is None or not auth_domain.verify_pkce(code_verifier, txn.code_challenge):
        raise HTTPException(status_code=400, detail="invalid or expired auth transaction")
    response.headers["Cache-Control"] = "no-store"
    identity = deps.auth0_client.exchange(code, code_verifier)
    email = str(identity.get("email") or "").strip().casefold()
    subject = str(identity.get("subject") or identity.get("sub") or "").strip()
    provider = str(identity.get("issuer") or "auth0").strip()
    if not email or not subject or identity.get("email_verified") is not True:
        raise HTTPException(status_code=400, detail="verified identity required")
    external = repository.get_external_identity(session, provider, subject)
    if external is not None:
        account = repository.get_account(session, external.account_id)
        if account is None:
            raise HTTPException(status_code=400, detail="identity account missing")
    else:
        account = repository.get_account_by_email(session, email)
        if account is not None and repository.account_has_provider_identity(
            session, account.id, provider
        ):
            raise HTTPException(status_code=409, detail="email already linked")
        if account is None:
            principal_email = os.environ.get("SBC_PRINCIPAL_ADMIN_EMAIL", "").strip().casefold()
            role = "PRINCIPAL_ADMIN" if principal_email and email == principal_email else "SUBSCRIBER"
            account = repository.create_account(session, email, role)
        repository.link_external_identity(session, account.id, provider, subject)
    principal_email = os.environ.get("SBC_PRINCIPAL_ADMIN_EMAIL", "").strip().casefold()
    if principal_email and email == principal_email and account.role != "PRINCIPAL_ADMIN":
        account.role = "PRINCIPAL_ADMIN"
        session.flush()
    raw_session = deps.make_session_nonce()
    raw_refresh = secrets.token_urlsafe(48)
    repository.create_device_session(
        session,
        account.id,
        session_nonce=raw_session,
        token_hash=auth_domain.hash_token(str(identity.get("access_token") or "")),
        refresh_token_hash=auth_domain.hash_token(raw_refresh),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=deps.default_refresh_expiry(),
    )
    ent = repository.get_latest_entitlement(session, account.id)
    return CallbackResult(
        session_nonce=raw_session,
        account_id=account.id,
        role=account.role,
        access=access_domain.compute_access(account.role, ent.state if ent else None),
        refresh_token=raw_refresh,
    )


@router.post("/logout")
def logout(x_guardian_session: str | None = Header(default=None), session: Session = Depends(deps.get_session)):
    if x_guardian_session:
        valid = repository.get_valid_session(session, x_guardian_session)
        if valid is not None:
            repository.revoke_device_session(session, valid.id)
            repository.revoke_pending_pairings(session, valid.account_id)
    return {"ok": True}


@router.get("/me")
def me(account_id: str = Depends(deps.get_session_account), session: Session = Depends(deps.get_session)):
    account = repository.get_account(session, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    ent = repository.get_latest_entitlement(session, account_id)
    return {
        "account_id": account.id,
        "email": account.email,
        "role": account.role,
        "access": access_domain.compute_access(account.role, ent.state if ent else None),
    }
