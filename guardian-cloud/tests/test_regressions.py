from __future__ import annotations

import pytest
from sqlalchemy import select

from guardian_cloud.api import deps
from guardian_cloud.domain import auth as auth_domain
from guardian_cloud.domain.traditional_solver import SolveResult
from guardian_cloud.persistence import repository as repo
from guardian_cloud.persistence.models import ClubSnapshot, Solution, StripeSubscription


def _session_for(session, account_id: str, *, role: str = "SUBSCRIBER", active: bool = True):
    account = repo.get_account(session, account_id)
    account.role = role
    account.status = "ACTIVE" if active else "DISABLED"
    raw = deps.make_session_nonce()
    device = repo.create_device_session(
        session,
        account.id,
        session_nonce=raw,
        token_hash=auth_domain.hash_token("access"),
        refresh_token_hash=auth_domain.hash_token("refresh"),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=deps.default_refresh_expiry(),
    )
    session.commit()
    return {"X-Guardian-Session": device.session_nonce}


def test_delete_account_removes_stripe_subscription(real_client, engine):
    from sqlalchemy.orm import sessionmaker

    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    with Local() as session:
        account = repo.create_account(session, "stripe-delete@example.com")
        repo.set_entitlement(
            session,
            account.id,
            plan="SBC_GUARDIAN_MONTHLY",
            state="ACTIVE",
            until=None,
            reason="test fixture",
        )
        nonce = deps.make_session_nonce()
        device = repo.create_device_session(
            session,
            account.id,
            session_nonce=nonce,
            token_hash=auth_domain.hash_token("access"),
            refresh_token_hash=auth_domain.hash_token("refresh"),
            expires_at=deps.default_session_expiry(),
        )
        session.add(
            StripeSubscription(
                id="sub-row",
                account_id=account.id,
                customer_id="cus-delete",
                subscription_id="sub-delete",
                price_id="price-monthly",
                status="active",
                last_event_created=1,
            )
        )
        session.commit()
        headers = {"X-Guardian-Session": device.session_nonce}
        account_id = account.id

    response = real_client.delete("/api/v2/account", headers=headers)

    assert response.status_code == 200
    with Local() as session:
        assert repo.get_account(session, account_id) is None
        assert session.execute(select(StripeSubscription)).scalars().all() == []


def test_inactive_admin_cannot_access_admin_routes(client, auth_headers, session):
    _headers, account_id = auth_headers
    headers = _session_for(session, account_id, role="ADMIN", active=False)

    response = client.get("/api/v2/admin/users", headers=headers)

    assert response.status_code == 401


def test_pairing_is_invalidated_when_owner_sessions_are_revoked(client, auth_headers, session):
    headers, account_id = auth_headers
    created = client.post("/api/v2/pairings", headers=headers, json={"ttl_seconds": 60})
    assert created.status_code == 200
    code = created.json()["code"]

    repo.revoke_all_device_sessions(session, account_id)
    session.commit()

    response = client.post("/api/v2/pairings/claim", json={"code": code})

    assert response.status_code == 400


def test_refresh_rotation_records_timestamp_and_rejects_replay(client, session):
    account = repo.create_account(session, "rotation@example.com")
    raw_refresh = "refresh-rotation"
    repo.create_device_session(
        session,
        account.id,
        session_nonce=deps.make_session_nonce(),
        token_hash=auth_domain.hash_token("access"),
        refresh_token_hash=auth_domain.hash_token(raw_refresh),
        expires_at=deps.default_session_expiry(),
        refresh_expires_at=deps.default_refresh_expiry(),
    )
    session.commit()

    response = client.post(
        "/api/v2/device-sessions/refresh",
        headers={"X-Guardian-Refresh": raw_refresh},
    )

    assert response.status_code == 200
    # The rotation timestamp is checked through the one new row, not the nonce
    # (the nonce is intentionally hashed in storage).
    rows = repo.get_valid_refresh_session(session, response.json()["refresh_token"])
    assert rows is not None
    assert rows.last_rotated_at is not None
    replay = client.post(
        "/api/v2/device-sessions/refresh",
        headers={"X-Guardian-Refresh": raw_refresh},
    )
    assert replay.status_code == 401


def test_stale_snapshot_hash_is_rejected(client, auth_headers, session):
    headers, account_id = auth_headers
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="snapshot-hash",
        items=[{"id": "p1", "rating": 80}],
        edition="FC26",
        schema_version=1,
    )
    session.commit()

    response = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"snapshot_id": snap.id, "snapshot_hash": "stale", "request": {}},
    )

    assert response.status_code == 409
    assert session.execute(select(Solution)).scalars().all() == []


def test_invalid_solver_selection_is_rejected_even_when_ids_are_owned(
    client, auth_headers, session, monkeypatch
):
    headers, account_id = auth_headers
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="valid",
        items=[{"id": "p1", "rating": 80}],
        edition="FC26",
        schema_version=1,
    )
    session.commit()
    monkeypatch.setattr(
        "guardian_cloud.api.solve.solve_traditional",
        lambda _case: SolveResult("SOLVED", ["p1"], 80),
    )

    response = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"snapshot_id": snap.id, "request": {}},
    )

    assert response.status_code == 422
    assert session.execute(select(Solution)).scalars().all() == []


def test_malformed_nested_requirements_are_client_errors(client, auth_headers, session):
    headers, account_id = auth_headers
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="requirements",
        items=[{"id": "p1", "rating": 80}],
        edition="FC26",
        schema_version=1,
    )
    session.commit()

    response = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={
            "snapshot_id": snap.id,
            "request": {"segments": [{"constraints": []}]},
        },
    )

    assert response.status_code in (400, 422)


def test_snapshot_content_cannot_be_updated(session):
    account = repo.create_account(session, "immutable@example.com")
    snapshot = repo.save_snapshot(
        session,
        account.id,
        snapshot_hash="immutable",
        items=[{"id": "p1", "rating": 80}],
    )
    session.commit()

    snapshot.snapshot_hash = "changed"
    with pytest.raises(ValueError, match="immutable"):
        session.commit()
    session.rollback()
    assert session.get(ClubSnapshot, snapshot.id).snapshot_hash == "immutable"
