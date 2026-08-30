from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any, Protocol


class StripeAdapter(Protocol):
    def create_checkout(
        self, account_id: str, success_url: str, cancel_url: str, idempotency_key: str
    ) -> dict:
        ...

    def create_portal(
        self, account_id: str, customer_id: str, return_url: str, idempotency_key: str
    ) -> dict:
        ...


def verify_webhook_signature(
    raw_body: bytes, sig_header: str, secret: str, *, tolerance_seconds: int = 300
) -> bool:
    """Verify a Stripe-style signature: t=timestamp,v1=hex(hmac)."""
    parts: dict[str, list[str]] = {}
    for piece in sig_header.split(","):
        if "=" in piece:
            k, v = piece.split("=", 1)
            parts.setdefault(k, []).append(v)
    timestamps = parts.get("t", [])
    signatures = parts.get("v1", [])
    if len(timestamps) != 1 or not signatures:
        return False
    ts = timestamps[0]
    try:
        timestamp = int(ts)
    except ValueError:
        return False
    if abs(int(time.time()) - timestamp) > tolerance_seconds:
        return False
    signed = f"{ts}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, signature) for signature in signatures)


def reconcile_event(event: dict[str, Any], expected_price_id: str) -> dict[str, Any] | None:
    """Validate a subscription event and map it to the entitlement projection."""
    etype = event.get("type")
    if etype not in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        return None
    obj = event.get("data", {}).get("object", {})
    prices = {
        item.get("price", {}).get("id")
        for item in obj.get("items", {}).get("data", [])
        if isinstance(item, dict)
    }
    if not expected_price_id or prices != {expected_price_id}:
        raise ValueError("stripe price mismatch")
    status = str(obj.get("status") or "")
    state_by_status = {
        "trialing": "TRIAL",
        "active": "ACTIVE",
        "past_due": "ON_HOLD",
        "unpaid": "ON_HOLD",
        "paused": "ON_HOLD",
        "incomplete": "ON_HOLD",
        "incomplete_expired": "EXPIRED",
        "canceled": "CANCELED",
    }
    state = "CANCELED" if etype == "customer.subscription.deleted" else state_by_status.get(status)
    if state is None:
        raise ValueError("unsupported stripe subscription status")
    return {
        "plan": "SBC_GUARDIAN_MONTHLY",
        "state": state,
        "until": obj.get("current_period_end"),
        "customer_id": obj.get("customer"),
        "subscription_id": obj.get("id"),
        "account_id": obj.get("metadata", {}).get("account_id"),
        "price_id": expected_price_id,
        "provider_status": status,
    }
