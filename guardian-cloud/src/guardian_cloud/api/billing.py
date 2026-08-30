from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..api import deps
from ..domain import stripe as stripe_domain
from ..persistence import repository

router = APIRouter(prefix="/api/v2", tags=["billing"])


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    success_url: str
    cancel_url: str
    idempotency_key: str = Field(min_length=8, max_length=128)


class CheckoutResult(BaseModel):
    session_id: str
    url: str


@router.post("/billing/checkout", response_model=CheckoutResult)
def checkout(
    req: CheckoutRequest,
    account_id: str = Depends(deps.get_session_account),
    session: Session = Depends(deps.get_session),
):
    if deps.stripe_adapter is None:
        raise HTTPException(status_code=503, detail="billing not configured")
    success_url = _configured_url("SBC_STRIPE_SUCCESS_URL", req.success_url)
    cancel_url = _configured_url("SBC_STRIPE_CANCEL_URL", req.cancel_url)
    request_hash = _request_hash({"success_url": success_url, "cancel_url": cancel_url})
    created, value = repository.record_idempotency(
        session, account_id, "checkout:" + req.idempotency_key, request_hash=request_hash
    )
    if not created and value:
        data = json.loads(value)
        return CheckoutResult(session_id=data["session_id"], url=data["url"])
    if not created:
        raise HTTPException(status_code=409, detail="checkout request already in progress")
    result = deps.stripe_adapter.create_checkout(
        account_id, success_url, cancel_url, "checkout:" + req.idempotency_key
    )
    repository.record_idempotency(
        session,
        account_id,
        "checkout:" + req.idempotency_key,
        value=json.dumps(result),
        request_hash=request_hash,
    )
    return CheckoutResult(session_id=result["session_id"], url=result["url"])


class PortalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    return_url: str
    idempotency_key: str = Field(min_length=8, max_length=128)


@router.post("/billing/portal", response_model=CheckoutResult)
def portal(
    req: PortalRequest,
    account_id: str = Depends(deps.get_session_account),
    session: Session = Depends(deps.get_session),
):
    if deps.stripe_adapter is None:
        raise HTTPException(status_code=503, detail="billing not configured")
    return_url = _configured_url("SBC_STRIPE_PORTAL_RETURN_URL", req.return_url)
    request_hash = _request_hash({"return_url": return_url})
    created, value = repository.record_idempotency(
        session,
        account_id,
        "portal:" + req.idempotency_key,
        request_hash=request_hash,
    )
    if not created and value:
        data = json.loads(value)
        return CheckoutResult(session_id=data["session_id"], url=data["url"])
    if not created:
        raise HTTPException(status_code=409, detail="portal request already in progress")
    account = repository.get_account(session, account_id)
    if account is None or not account.stripe_customer_id:
        raise HTTPException(status_code=409, detail="billing customer is not linked")
    result = deps.stripe_adapter.create_portal(
        account_id,
        account.stripe_customer_id,
        return_url,
        "portal:" + req.idempotency_key,
    )
    repository.record_idempotency(
        session,
        account_id,
        "portal:" + req.idempotency_key,
        value=json.dumps(result),
        request_hash=request_hash,
    )
    return CheckoutResult(session_id=result["session_id"], url=result["url"])


@router.post("/billing/stripe/webhook")
async def stripe_webhook(request: Request, session: Session = Depends(deps.get_session)):
    raw = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    secret = os.environ.get("SBC_STRIPE_WEBHOOK_SECRET", "")
    if not secret or not stripe_domain.verify_webhook_signature(
        raw, sig, secret
    ):
        raise HTTPException(status_code=400, detail="invalid signature")
    try:
        event = json.loads(raw.decode())
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="invalid webhook payload") from exc
    event_id = event.get("id")
    event_type = event.get("type")
    event_created = event.get("created")
    if not isinstance(event_id, str) or not isinstance(event_type, str) or not isinstance(event_created, int):
        raise HTTPException(status_code=400, detail="invalid webhook envelope")
    created, _ = repository.record_idempotency(session, "_system", "wh:" + event_id)
    if not created:
        return {"ok": True, "replayed": True}
    # Never log the full payload.
    try:
        mapping = stripe_domain.reconcile_event(
            event, os.environ.get("SBC_STRIPE_PRICE_MONTHLY", "")
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if mapping is not None:
        acct = mapping["account_id"]
        customer_id = mapping["customer_id"]
        subscription_id = mapping["subscription_id"]
        if not all(isinstance(value, str) and value for value in (acct, customer_id, subscription_id)):
            raise HTTPException(status_code=400, detail="stripe binding metadata missing")
        _, changed = repository.upsert_stripe_subscription(
            session,
            account_id=acct,
            customer_id=customer_id,
            subscription_id=subscription_id,
            price_id=mapping["price_id"],
            status=mapping["provider_status"],
            event_created=event_created,
        )
        if changed:
            until = (
                datetime.fromtimestamp(mapping["until"], UTC)
                if isinstance(mapping["until"], int)
                else None
            )
            repository.set_entitlement(
                session,
                acct,
                plan=mapping["plan"],
                state=mapping["state"],
                until=until,
                reason="stripe_webhook:" + event.get("type", ""),
                provider_event_created=event_created,
            )
    return {"ok": True, "replayed": False}


def _request_hash(payload: dict[str, str]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _configured_url(env_name: str, requested: str) -> str:
    configured = os.environ.get(env_name, "").strip()
    selected = configured or requested
    parsed = urlparse(selected)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        raise HTTPException(status_code=400, detail="invalid billing redirect URL")
    if configured and requested != configured:
        raise HTTPException(status_code=400, detail="billing redirect URL is server-controlled")
    return selected
