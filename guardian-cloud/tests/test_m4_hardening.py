from __future__ import annotations

import hashlib
import hmac
import json
import time

from sqlalchemy import select

from guardian_cloud.api import deps
from guardian_cloud.domain import auth as auth_domain
from guardian_cloud.persistence import repository
from guardian_cloud.persistence.models import DeviceSession, Pairing


class VerifiedAuth:
    email_verified = True

    def authorize_url(self, state, code_challenge):
        return "https://auth.example/authorize"

    def exchange(self, code, code_verifier):
        return {
            "access_token": "provider-token",
            "issuer": "https://auth.example/",
            "subject": "auth0|" + code,
            "email": "verified@example.com",
            "email_verified": self.email_verified,
        }


def _callback(client, code="one"):
    login = client.get("/api/v2/auth/login").json()
    return client.get(
        "/api/v2/auth/callback",
        params={
            "code": code,
            "state": login["state"],
            "code_verifier": login["code_verifier"],
        },
    )


def test_callback_requires_one_time_state_and_verified_identity(client, session):
    provider = VerifiedAuth()
    deps.set_auth0_client(provider)
    try:
        bad = client.get(
            "/api/v2/auth/callback",
            params={"code": "x", "state": "invented", "code_verifier": "invented"},
        )
        assert bad.status_code == 400
        provider.email_verified = False
        assert _callback(client, "unverified").status_code == 400
        provider.email_verified = True
        response = _callback(client)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        raw = response.json()["session_nonce"]
        stored = session.execute(select(DeviceSession)).scalars().one()
        assert stored.session_nonce_hash == hashlib.sha256(raw.encode()).hexdigest()
        assert raw != stored.session_nonce_hash
    finally:
        deps.set_auth0_client(None)


def test_pairing_is_owned_hashed_and_one_time(client, auth_headers, session):
    headers, account_id = auth_headers
    created = client.post("/api/v2/pairings", headers=headers, json={"ttl_seconds": 60})
    assert created.status_code == 200
    raw = created.json()["code"]
    stored = session.execute(select(Pairing)).scalars().one()
    assert stored.account_id == account_id
    assert stored.code_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert client.post("/api/v2/pairings/claim", json={"code": raw}).status_code == 200
    assert client.post("/api/v2/pairings/claim", json={"code": raw}).status_code == 400


def test_subscriber_without_entitlement_is_denied_before_solve(client, session):
    account = repository.create_account(session, "paywall@example.com")
    raw = deps.make_session_nonce()
    repository.create_device_session(
        session,
        account.id,
        session_nonce=raw,
        token_hash="",
        refresh_token_hash=auth_domain.hash_token("refresh"),
        expires_at=deps.default_session_expiry(),
    )
    session.commit()
    response = client.post(
        "/api/v2/solve/traditional",
        headers={"X-Guardian-Session": raw},
        json={"snapshot_id": "missing", "request": {}},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ENTITLEMENT_REQUIRED"


def test_access_endpoint_is_unique_and_server_authoritative(client, auth_headers):
    paths = [route for route in client.app.openapi()["paths"] if route == "/api/v2/access"]
    assert paths == ["/api/v2/access"]
    headers, _ = auth_headers
    response = client.get("/api/v2/access", headers=headers)
    assert response.json()["level"] == "FULL"


def test_idempotency_key_cannot_be_reused_for_another_payload(session):
    created, _ = repository.record_idempotency(
        session, "account", "checkout:key", request_hash="first"
    )
    assert created
    try:
        repository.record_idempotency(
            session, "account", "checkout:key", request_hash="second"
        )
    except repository.ConflictError:
        pass
    else:
        raise AssertionError("different request reused an idempotency key")


def test_webhook_rejects_wrong_price(client, monkeypatch):
    monkeypatch.setenv("SBC_STRIPE_WEBHOOK_SECRET", "secret")
    monkeypatch.setenv("SBC_STRIPE_PRICE_MONTHLY", "expected")
    event = {
        "id": "evt_wrong_price",
        "type": "customer.subscription.updated",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": "sub",
                "customer": "cus",
                "status": "active",
                "metadata": {"account_id": "unknown"},
                "items": {"data": [{"price": {"id": "wrong"}}]},
            }
        },
    }
    raw = json.dumps(event).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        b"secret", f"{timestamp}.".encode() + raw, hashlib.sha256
    ).hexdigest()
    response = client.post(
        "/api/v2/billing/stripe/webhook",
        content=raw,
        headers={"Stripe-Signature": f"t={timestamp},v1={signature}"},
    )
    assert response.status_code == 400


def test_admin_cannot_assign_principal(client, session):
    principal = repository.create_account(session, "principal@example.com", "PRINCIPAL_ADMIN")
    target = repository.create_account(session, "target@example.com")
    raw = deps.make_session_nonce()
    repository.create_device_session(
        session,
        principal.id,
        session_nonce=raw,
        token_hash="",
        refresh_token_hash="",
        expires_at=deps.default_session_expiry(),
    )
    session.commit()
    response = client.post(
        f"/api/v2/admin/users/{target.id}/role",
        headers={"X-Guardian-Session": raw},
        json={"role": "PRINCIPAL_ADMIN", "reason": "attempted owner promotion"},
    )
    assert response.status_code == 422
