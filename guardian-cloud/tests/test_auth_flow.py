from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest

from guardian_cloud.api import deps
from guardian_cloud.domain import auth as auth_domain
from guardian_cloud.persistence import repository


class FakeAuth0:
    def __init__(self, email="user@example.com"):
        self.email = email

    def authorize_url(self, state, code_challenge):
        return f"https://auth.example/authorize?state={state}&code_challenge={code_challenge}"

    def exchange(self, code, code_verifier):
        return {
            "access_token": "at-" + code,
            "refresh_token": "rt-" + code,
            "id_token": "id",
            "email": self.email,
            "subject": "auth0|" + code,
            "issuer": "https://auth.example/",
            "email_verified": True,
        }


class FakeStripe:
    def __init__(self):
        self.calls = []

    def create_checkout(self, account_id, success_url, cancel_url, idempotency_key):
        self.calls.append(("checkout", account_id))
        return {"session_id": "cs_" + account_id, "url": success_url}

    def create_portal(self, account_id, customer_id, return_url, idempotency_key):
        return {"session_id": "portal_" + account_id, "url": return_url}


@pytest.fixture
def authed(client, session, monkeypatch):
    monkeypatch.setenv("SBC_STRIPE_WEBHOOK_SECRET", "whsec_test")
    monkeypatch.setenv("SBC_STRIPE_PRICE_MONTHLY", "price_monthly")
    monkeypatch.setenv("SBC_PRINCIPAL_ADMIN_EMAIL", "boss@example.com")
    fake_auth0 = FakeAuth0()
    fake_stripe = FakeStripe()
    deps.set_auth0_client(fake_auth0)
    deps.set_stripe_adapter(fake_stripe)
    yield client, session, fake_auth0, fake_stripe
    deps.set_auth0_client(None)
    deps.set_stripe_adapter(None)


def _session_nonce(session, role="SUBSCRIBER", email="sub@example.com"):
    acct = repository.create_account(session, email, role)
    raw_refresh = "refresh-" + email
    ds = repository.create_device_session(
        session,
        acct.id,
        session_nonce=deps.make_session_nonce(),
        token_hash=auth_domain.hash_token("at"),
        refresh_token_hash=auth_domain.hash_token(raw_refresh),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=deps.default_refresh_expiry(),
    )
    return acct.id, ds.session_nonce, raw_refresh


def _login_callback(client, code: str):
    login = client.get("/api/v2/auth/login")
    assert login.status_code == 200
    values = login.json()
    return client.get(
        "/api/v2/auth/callback",
        params={
            "code": code,
            "state": values["state"],
            "code_verifier": values["code_verifier"],
        },
    )


def test_login_returns_url(authed):
    client, *_ = authed
    r = client.get("/api/v2/auth/login")
    assert r.status_code == 200
    assert "authorize" in r.json()["authorize_url"]


def test_callback_me_logout(authed):
    client, session, fake_auth0, _ = authed
    fake_auth0.email = "sub@example.com"
    r = _login_callback(client, "c1")
    assert r.status_code == 200
    body = r.json()
    nonce = body["session_nonce"]
    assert body["role"] == "SUBSCRIBER"
    assert body["access"] == "PAYWALL"  # no entitlement yet

    me = client.get("/api/v2/auth/me", headers={"X-Guardian-Session": nonce})
    assert me.status_code == 200
    assert me.json()["account_id"] == body["account_id"]

    client.post("/api/v2/auth/logout", headers={"X-Guardian-Session": nonce})
    after = client.get("/api/v2/auth/me", headers={"X-Guardian-Session": nonce})
    assert after.status_code == 401


def test_session_rotation_invalidates_old(authed):
    client, session, *_ = authed
    _, nonce, refresh = _session_nonce(session)
    resp = client.post(
        "/api/v2/device-sessions/refresh",
        headers={"X-Guardian-Refresh": refresh},
    )
    assert resp.status_code == 200
    new_nonce = resp.json()["session_nonce"]
    assert new_nonce != nonce
    old = client.get("/api/v2/auth/me", headers={"X-Guardian-Session": nonce})
    assert old.status_code == 401
    new = client.get("/api/v2/auth/me", headers={"X-Guardian-Session": new_nonce})
    assert new.status_code == 200


def test_principal_immutable(authed):
    client, session, fake_auth0, _ = authed
    fake_auth0.email = "boss@example.com"
    r = _login_callback(client, "p")
    assert r.json()["role"] == "PRINCIPAL_ADMIN"

    # Another admin tries to demote the principal -> rejected.
    _, admin_nonce, _ = _session_nonce(session, role="ADMIN", email="admin@example.com")
    principal_id = r.json()["account_id"]
    demote = client.post(
        f"/api/v2/admin/users/{principal_id}/role",
        headers={"X-Guardian-Session": admin_nonce},
        json={"role": "SUBSCRIBER", "reason": "documented principal demotion attempt"},
    )
    assert demote.status_code == 403


def test_subscriber_403_on_admin(authed):
    client, session, *_ = authed
    _, nonce, _ = _session_nonce(session, role="SUBSCRIBER", email="s2@example.com")
    r = client.get("/api/v2/admin/users", headers={"X-Guardian-Session": nonce})
    assert r.status_code == 403


def test_admin_lists_users(authed):
    client, session, *_ = authed
    _, nonce, _ = _session_nonce(session, role="ADMIN", email="admin2@example.com")
    r = client.get("/api/v2/admin/users", headers={"X-Guardian-Session": nonce})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_checkout_idempotent(authed):
    client, session, _, fake_stripe = authed
    _, nonce, _ = _session_nonce(session, email="buyer@example.com")
    headers = {"X-Guardian-Session": nonce}
    first = client.post(
        "/api/v2/billing/checkout",
        headers=headers,
        json={"success_url": "https://x/ok", "cancel_url": "https://x/no", "idempotency_key": "checkout-key-1"},
    )
    second = client.post(
        "/api/v2/billing/checkout",
        headers=headers,
        json={"success_url": "https://x/ok", "cancel_url": "https://x/no", "idempotency_key": "checkout-key-1"},
    )
    assert first.json()["session_id"] == second.json()["session_id"]
    assert len(fake_stripe.calls) == 1  # adapter called once


def test_webhook_replay_noop(authed):
    client, session, *_ = authed
    target = repository.create_account(session, "stripe-target@example.com")
    session.flush()
    event = {
        "id": "evt_1",
        "type": "customer.subscription.updated",
        "created": int(time.time()),
        "data": {
            "object": {
                "id": "sub_1",
                "customer": "cus_1",
                "status": "active",
                "current_period_end": int(time.time()) + 3600,
                "metadata": {"account_id": target.id},
                "items": {"data": [{"price": {"id": "price_monthly"}}]},
            }
        },
    }
    raw = json.dumps(event).encode()
    ts = str(int(time.time()))
    sig = _sign(raw, ts, "whsec_test")
    r1 = client.post(
        "/api/v2/billing/stripe/webhook",
        content=raw,
        headers={"Stripe-Signature": f"t={ts},v1={sig}"},
    )
    assert r1.status_code == 200
    assert r1.json()["replayed"] is False

    r2 = client.post(
        "/api/v2/billing/stripe/webhook",
        content=raw,
        headers={"Stripe-Signature": f"t={ts},v1={sig}"},
    )
    assert r2.json()["replayed"] is True

    bad = client.post(
        "/api/v2/billing/stripe/webhook",
        content=raw,
        headers={"Stripe-Signature": "t=1,v1=bad"},
    )
    assert bad.status_code == 400


def _sign(raw: bytes, ts: str, secret: str) -> str:
    signed = f"{ts}.".encode() + raw
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
