from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from sqlalchemy.orm import sessionmaker

from guardian_cloud.api import deps
from guardian_cloud.api.app import create_app
from guardian_cloud.persistence import repository as repo

FIX = Path(__file__).parent / "fixtures" / "solver"


def _authed(session, email="m3@example.com", role="SUBSCRIBER"):
    acct = repo.create_account(session, email, role)
    repo.set_entitlement(
        session,
        acct.id,
        plan="guardian-pro",
        state="ACTIVE",
        until=None,
        reason="test fixture",
    )
    session.commit()
    ds = repo.create_device_session(
        session,
        acct.id,
        session_nonce=deps.make_session_nonce(),
        token_hash="t",
        refresh_token_hash="r",
        expires_at=deps.default_session_expiry(),
    )
    session.commit()
    return {"X-Guardian-Session": ds.session_nonce}, acct.id


# --------------------------------------------------------------------------
# A2 + A1: route matrix — no private route depends on X-Guardian-Account, and
# real requests prove the authenticated/ownership boundary.
# --------------------------------------------------------------------------


def _dependency_names(dependant):
    names = {dependant.call.__name__}
    for d in dependant.dependencies:
        names |= _dependency_names(d)
    return names


def test_no_route_depends_on_x_guardian_account():
    app = create_app()
    for route in app.routes:
        if isinstance(route, APIRoute):
            assert "get_account_id" not in _dependency_names(route.dependant), route.path


PRIVATE = [
    ("GET", "/api/v2/access", None),
    ("GET", "/api/v2/guardian/policy", None),
    ("GET", "/api/v2/privacy", None),
    ("GET", "/api/v2/snapshots/latest", None),
    ("POST", "/api/v2/snapshots", {"snapshot_id": "s", "snapshot_hash": "h"}),
    ("PUT", "/api/v2/guardian/policy", {"protect_evolution_eligible": False}),
    ("PUT", "/api/v2/privacy", {"prefs": {}}),
    ("POST", "/api/v2/solve/traditional", {"request": {}, "policy": {}, "snapshot_id": "x"}),
    ("POST", "/api/v2/solve/streamlined", {"snapshot_id": "x"}),
    ("POST", "/api/v2/solutions/does-not-exist/confirm", {"decision_id": "d"}),
    ("GET", "/api/v2/account/export", None),
    ("POST", "/api/v2/requirements/compile", {"segments": []}),
    ("GET", "/api/v2/scoring-rulesets/active", None),
]
PUBLIC_OK = [
    ("GET", "/api/v2/health/live", None),
    ("GET", "/api/v2/auth/login", None),
]


@pytest.mark.parametrize("method,path,body", PRIVATE)
def test_private_routes_require_auth(client, method, path, body):
    r = client.request(method, path, json=body)
    assert r.status_code == 401, (path, r.status_code)


@pytest.mark.parametrize("method,path,body", PUBLIC_OK)
def test_public_routes_allow_anon(client, method, path, body):
    r = client.request(method, path, json=body)
    assert r.status_code != 401, (path, r.status_code)


# --------------------------------------------------------------------------
# B: transaction model — commit on success, rollback on failure, always close.
# --------------------------------------------------------------------------


def test_mutation_persists_across_fresh_session(real_client, engine):
    from sqlalchemy import text

    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    with Local() as s:
        acct = repo.create_account(s, "persist@example.com")
        repo.set_entitlement(
            s,
            acct.id,
            plan="guardian-pro",
            state="ACTIVE",
            until=None,
            reason="test fixture",
        )
        s.commit()
        ds = repo.create_device_session(
            s,
            acct.id,
            session_nonce=deps.make_session_nonce(),
            token_hash="t",
            refresh_token_hash="r",
            expires_at=deps.default_session_expiry(),
        )
        s.commit()
        headers = {"X-Guardian-Session": ds.session_nonce}
        account_id = acct.id

    r = real_client.post(
        "/api/v2/snapshots",
        headers=headers,
        json={"snapshot_id": "s1", "snapshot_hash": "h", "items": [{"id": "p1", "rating": 80}], "player_count": 1},
    )
    assert r.status_code == 200
    with engine.connect() as conn:
        n = conn.execute(
            text("select count(*) from club_snapshots where account_id = :a"), {"a": account_id}
        ).scalar()
        assert n == 1

    r2 = real_client.put("/api/v2/privacy", headers=headers, json={"prefs": {"export_opt_in": True}})
    assert r2.status_code == 200
    with engine.connect() as conn:
        row = conn.execute(
            text("select prefs_json from privacy_preferences where account_id = :a"), {"a": account_id}
        ).scalar()
        assert row is not None and "export_opt_in" in json.loads(row)


def test_rollback_on_exception(engine):
    old = deps.SessionLocal
    deps.SessionLocal = sessionmaker(bind=engine, future=True, autoflush=False)
    try:
        gen = deps.get_session()
        s = next(gen)
        acct = repo.create_account(s, "rollback@example.com")
        try:
            gen.throw(RuntimeError("boom"))
        except RuntimeError:
            pass
        Local = sessionmaker(bind=engine, future=True, autoflush=False)
        with Local() as fs:
            assert repo.get_account(fs, acct.id) is None
    finally:
        deps.SessionLocal = old


# --------------------------------------------------------------------------
# C: snapshot ownership + immutable solver input.
# --------------------------------------------------------------------------


def test_traditional_solve_uses_owned_snapshot_only(client, auth_headers, session):
    headers, account_id = auth_headers
    case = json.loads((FIX / "synthetic_fc26_traditional_v1.json").read_text())["cases"][0]
    snap = repo.save_snapshot(session, account_id, snapshot_hash="h", items=case["items"], edition="FC26", schema_version=1)
    session.commit()
    r = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"request": case["request"], "policy": case.get("policy", {}), "snapshot_id": snap.id},
    )
    assert r.status_code == 200
    selected = set(r.json()["selected"])
    snapshot_ids = {str(it["id"]) for it in case["items"]}
    assert selected.issubset(snapshot_ids)  # never selects items outside the snapshot


def test_foreign_snapshot_is_404(client, auth_headers, other_auth_headers, session):
    headers, account_id = auth_headers
    other_headers, _ = other_auth_headers
    snap = repo.save_snapshot(session, account_id, snapshot_hash="h", items=[{"id": "p1", "rating": 80}], edition="FC26", schema_version=1)
    session.commit()
    r = client.post(
        "/api/v2/solve/traditional",
        headers=other_headers,
        json={"request": {}, "policy": {}, "snapshot_id": snap.id},
    )
    assert r.status_code == 404  # foreign resource indistinguishable from missing


def test_snapshot_edition_mismatch_fails(client, auth_headers, session):
    headers, account_id = auth_headers
    snap = repo.save_snapshot(session, account_id, snapshot_hash="h", items=[{"id": "p1", "rating": 80}], edition="FC27", schema_version=2)
    session.commit()
    r = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"request": {}, "policy": {}, "snapshot_id": snap.id},
    )
    assert r.status_code == 400  # FC26 solver rejects FC27 snapshot


# --------------------------------------------------------------------------
# D + 8/9/10: exact ACTIVE FC27 ruleset, server-side points, no client influence.
# --------------------------------------------------------------------------


def _seed_fc27(session, account_id):
    data = json.loads((FIX / "synthetic_fc27_streamlined_v1.json").read_text())
    rs = repo.create_ruleset(session, "FC27", data["ruleset_version"], {"k": "v"}, active=True)
    for it in data["items"]:
        repo.add_ruleset_entry(
            session,
            rs.id,
            int(it["rating"]),
            str(it["scoring_category"]),
            int(it["points"]),
        )
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h",
        items=data["items"],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    return rs, snap, data


def test_streamlined_uses_server_points_not_client(client, auth_headers, session):
    headers, account_id = auth_headers
    rs, snap, data = _seed_fc27(session, account_id)
    r = client.post("/api/v2/solve/streamlined", headers=headers, json={"snapshot_id": snap.id, "ruleset_version": data["ruleset_version"]})
    assert r.status_code == 200
    server_points = {str(it["id"]): int(it.get("points", 0)) for it in data["items"]}
    assert r.json()["score"] == sum(server_points[i] for i in r.json()["selected"])


def test_streamlined_no_active_ruleset_fails(client, auth_headers, session):
    headers, account_id = auth_headers
    data = json.loads((FIX / "synthetic_fc27_streamlined_v1.json").read_text())
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h",
        items=data["items"],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    r = client.post("/api/v2/solve/streamlined", headers=headers, json={"snapshot_id": snap.id})
    assert r.status_code == 409  # no ACTIVE FC27 ruleset


def test_streamlined_ruleset_version_mismatch_fails(client, auth_headers, session):
    headers, account_id = auth_headers
    rs, snap, data = _seed_fc27(session, account_id)
    r = client.post("/api/v2/solve/streamlined", headers=headers, json={"snapshot_id": snap.id, "ruleset_version": "WRONG"})
    assert r.status_code == 409


def test_streamlined_unscorable_item_fails(client, auth_headers, session):
    headers, account_id = auth_headers
    data = json.loads((FIX / "synthetic_fc27_streamlined_v1.json").read_text())
    repo.create_ruleset(session, "FC27", data["ruleset_version"], {}, active=True)
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h",
        items=data["items"],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    # No ScoringEntry rows seeded -> every item is unscorable.
    r = client.post("/api/v2/solve/streamlined", headers=headers, json={"snapshot_id": snap.id, "ruleset_version": data["ruleset_version"]})
    assert r.status_code in (409, 422)


# --------------------------------------------------------------------------
# 11: invalid solver output never persisted.
# --------------------------------------------------------------------------


def test_infeasible_traditional_not_persisted(client, auth_headers, session):
    from sqlalchemy import select

    from guardian_cloud.persistence.models import Solution

    headers, account_id = auth_headers
    items = [{"id": f"p{i}", "rating": 70, "league": f"L{i}", "nation": f"N{i}", "club": f"C{i}"} for i in range(11)]
    snap = repo.save_snapshot(session, account_id, snapshot_hash="h", items=items, edition="FC26", schema_version=1)
    session.commit()
    r = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"request": {"segments": [{"constraints": {"min_team_rating": 99}}]}, "policy": {}, "snapshot_id": snap.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "INFEASIBLE"
    # No solution rows created for this account.
    n = session.execute(select(Solution).where(Solution.account_id == account_id)).scalars().all()
    assert len(n) == 0


# --------------------------------------------------------------------------
# 12/13/14: confirm idempotent, overlap rejected, dismiss consumes nothing.
# --------------------------------------------------------------------------


def _pending_solution(session, account_id, *, challenge_id, decision_id, item_ids):
    snapshot_hash = f"snapshot-{challenge_id}"
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash=snapshot_hash,
        items=[{"id": item_id, "rating": 80} for item_id in item_ids],
        edition="FC26",
        schema_version=1,
    )
    return repo.create_solution(
        session,
        account_id,
        format="TRADITIONAL",
        challenge_id=challenge_id,
        decision_id=decision_id,
        snapshot_hash=snapshot_hash,
        snapshot_id=snap.id,
        edition="FC26",
        item_ids=item_ids,
    )


def test_confirm_idempotent(client, auth_headers, session):
    headers, account_id = auth_headers
    sol = _pending_solution(
        session, account_id, challenge_id="c", decision_id="d", item_ids=["a", "b"]
    )
    session.commit()
    r1 = client.post(f"/api/v2/solutions/{sol.id}/confirm", headers=headers, json={"decision_id": "d"})
    r2 = client.post(f"/api/v2/solutions/{sol.id}/confirm", headers=headers, json={"decision_id": "d"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["status"] == "CONFIRMED" and r2.json()["status"] == "CONFIRMED"


def test_overlapping_confirm_rejected(client, auth_headers, session):
    headers, account_id = auth_headers
    s1 = _pending_solution(
        session, account_id, challenge_id="c1", decision_id="d1", item_ids=["a", "b"]
    )
    s2 = _pending_solution(
        session, account_id, challenge_id="c2", decision_id="d2", item_ids=["b", "c"]
    )
    session.commit()
    assert client.post(f"/api/v2/solutions/{s1.id}/confirm", headers=headers, json={"decision_id": "d1"}).status_code == 200
    r2 = client.post(f"/api/v2/solutions/{s2.id}/confirm", headers=headers, json={"decision_id": "d2"})
    assert r2.status_code == 409  # overlapping item 'b' already consumed


def test_dismiss_consumes_nothing(client, auth_headers, session):
    headers, account_id = auth_headers
    s1 = _pending_solution(
        session, account_id, challenge_id="c1", decision_id="d1", item_ids=["a", "b"]
    )
    session.commit()
    client.post(f"/api/v2/solutions/{s1.id}/confirm", headers=headers, json={"decision_id": "d1"})
    # A separate solution that is dismissed instead of confirmed.
    s2 = _pending_solution(
        session, account_id, challenge_id="c2", decision_id="d2", item_ids=["c", "d"]
    )
    session.commit()
    r = client.post(f"/api/v2/solutions/{s2.id}/dismiss", headers=headers)
    assert r.status_code == 200 and r.json()["status"] == "DISMISSED"
    # Dismissed solution's items are NOT treated as consumed.
    consumed = repo.confirmed_item_ids(session, account_id)
    assert "c" not in consumed and "d" not in consumed
    assert consumed == {"a", "b"}


# --------------------------------------------------------------------------
# 15: export/delete/privacy use authenticated ownership.
# --------------------------------------------------------------------------


def test_export_scoped_to_owner(client, auth_headers, other_auth_headers, session):
    headers, account_id = auth_headers
    other_headers, other_id = other_auth_headers
    own = repo.save_snapshot(session, account_id, snapshot_hash="own", items=[], edition="FC26")
    other = repo.save_snapshot(session, other_id, snapshot_hash="other", items=[], edition="FC26")
    session.commit()
    r = client.get("/api/v2/account/export", headers=headers)
    assert r.status_code == 200
    assert r.json()["account_id"] == account_id
    assert own.id in r.json()["snapshots"]
    assert other.id not in r.json()["snapshots"]


def test_delete_removes_only_owner(client, auth_headers, other_auth_headers, session):
    headers, account_id = auth_headers
    other_headers, other_id = other_auth_headers
    repo.save_snapshot(session, account_id, snapshot_hash="own", items=[])
    repo.save_snapshot(session, other_id, snapshot_hash="other", items=[])
    session.commit()
    assert client.delete("/api/v2/account", headers=headers).status_code == 200
    # The other account's snapshot is untouched.
    assert repo.latest_snapshot(session, other_id) is not None


# --------------------------------------------------------------------------
# 16: determinism.
# --------------------------------------------------------------------------


def test_determinism_traditional(client, auth_headers, session):
    headers, account_id = auth_headers
    case = json.loads((FIX / "synthetic_fc26_traditional_v1.json").read_text())["cases"][0]
    snap = repo.save_snapshot(session, account_id, snapshot_hash="h", items=case["items"], edition="FC26", schema_version=1)
    session.commit()
    body = {"request": case["request"], "policy": case.get("policy", {}), "snapshot_id": snap.id}
    a = client.post("/api/v2/solve/traditional", headers=headers, json=body).json()
    b = client.post("/api/v2/solve/traditional", headers=headers, json=body).json()
    assert a["selected"] == b["selected"]


def test_determinism_streamlined(client, auth_headers, session):
    headers, account_id = auth_headers
    rs, snap, data = _seed_fc27(session, account_id)
    body = {"snapshot_id": snap.id, "ruleset_version": data["ruleset_version"]}
    a = client.post("/api/v2/solve/streamlined", headers=headers, json=body).json()
    b = client.post("/api/v2/solve/streamlined", headers=headers, json=body).json()
    assert a["selected"] == b["selected"]


def test_streamlined_scores_exact_rating_and_category_not_item_id(
    client, auth_headers, session
):
    headers, account_id = auth_headers
    ruleset = repo.create_ruleset(session, "FC27", "exact-v1", {}, active=True)
    repo.add_ruleset_entry(session, ruleset.id, 84, "GOLD_COMMON", 4)
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="exact",
        items=[
            {
                "id": "attacker-controlled-item-id",
                "rating": 84,
                "scoring_category": "GOLD_COMMON",
                "points": 999999,
            }
        ],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    response = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={"snapshot_id": snap.id, "ruleset_version": "exact-v1"},
    )
    assert response.status_code == 200
    assert response.json()["score"] == 4


def test_streamlined_unknown_category_is_unscorable(client, auth_headers, session):
    headers, account_id = auth_headers
    ruleset = repo.create_ruleset(session, "FC27", "exact-v1", {}, active=True)
    repo.add_ruleset_entry(session, ruleset.id, 84, "GOLD_COMMON", 4)
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="unknown-category",
        items=[{"id": "p1", "rating": 84, "scoring_category": "FORGED", "points": 4}],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    response = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={"snapshot_id": snap.id, "ruleset_version": "exact-v1"},
    )
    assert response.status_code == 422


def test_invalid_solver_selection_is_not_persisted(
    client, auth_headers, session, monkeypatch
):
    from sqlalchemy import select

    from guardian_cloud.domain.traditional_solver import SolveResult
    from guardian_cloud.persistence.models import Solution

    headers, account_id = auth_headers
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="invalid-output",
        items=[{"id": "owned", "rating": 80}],
        edition="FC26",
        schema_version=1,
    )
    session.commit()
    monkeypatch.setattr(
        "guardian_cloud.api.solve.solve_traditional",
        lambda _case: SolveResult("SOLVED", ["forged"], 99),
    )
    response = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"request": {}, "snapshot_id": snap.id},
    )
    assert response.status_code == 422
    assert session.execute(select(Solution)).scalars().all() == []


def test_dismissed_solution_cannot_later_confirm(client, auth_headers, session):
    headers, account_id = auth_headers
    solution = _pending_solution(
        session, account_id, challenge_id="dismiss-first", decision_id="d", item_ids=["a"]
    )
    session.commit()
    assert (
        client.post(f"/api/v2/solutions/{solution.id}/dismiss", headers=headers).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v2/solutions/{solution.id}/confirm",
            headers=headers,
            json={"decision_id": "d"},
        ).status_code
        == 409
    )


def test_confirmed_solution_cannot_be_dismissed(client, auth_headers, session):
    headers, account_id = auth_headers
    solution = _pending_solution(
        session, account_id, challenge_id="confirm-first", decision_id="d", item_ids=["a"]
    )
    session.commit()
    assert (
        client.post(
            f"/api/v2/solutions/{solution.id}/confirm",
            headers=headers,
            json={"decision_id": "d"},
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v2/solutions/{solution.id}/dismiss", headers=headers).status_code
        == 409
    )


def test_snapshot_ingest_strips_client_points(client, auth_headers, session):
    headers, account_id = auth_headers
    response = client.post(
        "/api/v2/snapshots",
        headers=headers,
        json={
            "snapshot_hash": "strip-points",
            "edition": "FC27",
            "schema_version": 2,
            "items": [
                {
                    "id": "p1",
                    "rating": 84,
                    "scoring_category": "GOLD_COMMON",
                    "points": 999,
                }
            ],
        },
    )
    assert response.status_code == 200
    stored = repo.get_snapshot_items(session, account_id, response.json()["id"])
    assert stored[0]["points"] == 0
    assert repo.get_snapshot(session, account_id, response.json()["id"]).taxonomy_verified is False


def test_subscriber_claimed_fc27_category_cannot_be_solved(
    client, auth_headers, session
):
    headers, _account_id = auth_headers
    ruleset = repo.create_ruleset(session, "FC27", "verified-only", {}, active=True)
    repo.add_ruleset_entry(session, ruleset.id, 84, "GOLD_RARE", 100)
    session.commit()
    snapshot_response = client.post(
        "/api/v2/snapshots",
        headers=headers,
        json={
            "snapshot_hash": "subscriber-taxonomy-claim",
            "edition": "FC27",
            "schema_version": 2,
            "items": [
                {"id": "p1", "rating": 84, "scoring_category": "GOLD_RARE"}
            ],
        },
    )
    solve_response = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={
            "snapshot_id": snapshot_response.json()["id"],
            "ruleset_version": "verified-only",
        },
    )
    assert solve_response.status_code == 409
    assert solve_response.json()["detail"] == "FC27 snapshot taxonomy is not verified"


def test_account_delete_cleans_fk_dependents(real_client, engine):
    from sqlalchemy.orm import sessionmaker

    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    with Local() as session:
        headers, account_id = _authed(session, email="delete-fk@example.com")
        snap = repo.save_snapshot(
            session,
            account_id,
            snapshot_hash="delete-fk",
            items=[{"id": "a", "rating": 80}],
            edition="FC26",
            schema_version=1,
        )
        repo.create_solution(
            session,
            account_id,
            format="TRADITIONAL",
            challenge_id="c",
            decision_id="d",
            snapshot_hash=snap.snapshot_hash,
            snapshot_id=snap.id,
            item_ids=["a"],
        )
        session.commit()
    response = real_client.delete("/api/v2/account", headers=headers)
    assert response.status_code == 200
    with Local() as session:
        assert repo.get_account(session, account_id) is None


def test_traditional_uses_stored_policy_not_request_policy(client, auth_headers, session):
    headers, account_id = auth_headers
    evo_id = "evolution-item"
    items = [{"id": evo_id, "rating": 1, "evolution_eligible": True}]
    items.extend({"id": f"regular-{index}", "rating": 80} for index in range(11))
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="stored-policy",
        items=items,
        edition="FC26",
        schema_version=1,
    )
    repo.put_policy(session, account_id, {"protect_evolution_eligible": True})
    session.commit()
    response = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={
            "snapshot_id": snap.id,
            "request": {"segments": [{"constraints": {}}]},
            "policy": {"protect_evolution_eligible": False},
        },
    )
    assert response.status_code == 200
    assert evo_id not in response.json()["selected"]


def test_ruleset_change_during_solve_persists_nothing(
    client, auth_headers, session, monkeypatch
):
    from sqlalchemy import select

    from guardian_cloud.persistence.models import Solution

    headers, account_id = auth_headers
    ruleset, snap, data = _seed_fc27(session, account_id)
    original = repo.active_ruleset
    calls = 0

    def changed_after_first_lookup(db_session, edition):
        nonlocal calls
        calls += 1
        if calls == 1:
            return original(db_session, edition)
        return None

    monkeypatch.setattr(repo, "active_ruleset", changed_after_first_lookup)
    response = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={"snapshot_id": snap.id, "ruleset_version": ruleset.ruleset_version},
    )
    assert response.status_code == 409
    assert session.execute(select(Solution)).scalars().all() == []


def test_streamlined_solve_then_confirm_consumes_only_at_confirmation(
    client, auth_headers, session
):
    headers, account_id = auth_headers
    _ruleset, snap, data = _seed_fc27(session, account_id)
    solve_response = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={"snapshot_id": snap.id, "ruleset_version": data["ruleset_version"]},
    )
    assert solve_response.status_code == 200
    solved = solve_response.json()
    assert solved["solution_id"] and solved["decision_id"]
    assert repo.confirmed_item_ids(session, account_id) == set()

    confirm_response = client.post(
        f"/api/v2/solutions/{solved['solution_id']}/confirm",
        headers=headers,
        json={"decision_id": solved["decision_id"]},
    )
    assert confirm_response.status_code == 200
    assert repo.confirmed_item_ids(session, account_id) == set(solved["selected"])


def test_solution_and_confirmation_persist_across_real_request_sessions(real_client, engine):
    from sqlalchemy.orm import sessionmaker

    from guardian_cloud.persistence.models import Solution

    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    case = json.loads((FIX / "synthetic_fc26_traditional_v1.json").read_text())["cases"][0]
    with Local() as session:
        headers, account_id = _authed(session, email="real-solve@example.com")
        snap = repo.save_snapshot(
            session,
            account_id,
            snapshot_hash="real-solve",
            items=case["items"],
            edition="FC26",
            schema_version=1,
        )
        session.commit()
        snapshot_id = snap.id

    solve_response = real_client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"snapshot_id": snapshot_id, "request": case["request"]},
    )
    assert solve_response.status_code == 200
    solved = solve_response.json()
    with Local() as session:
        assert session.get(Solution, solved["solution_id"]).status == "PENDING"
        assert repo.confirmed_item_ids(session, account_id) == set()

    confirm_response = real_client.post(
        f"/api/v2/solutions/{solved['solution_id']}/confirm",
        headers=headers,
        json={"decision_id": solved["decision_id"]},
    )
    assert confirm_response.status_code == 200
    with Local() as session:
        assert session.get(Solution, solved["solution_id"]).status == "CONFIRMED"
        assert repo.confirmed_item_ids(session, account_id) == set(solved["selected"])
