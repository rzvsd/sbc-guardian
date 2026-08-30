import json
from pathlib import Path

from guardian_cloud.persistence import repository as repo

FIX = Path(__file__).parent / "fixtures" / "solver"


def test_health(client):
    assert client.get("/api/v2/health/live").status_code == 200
    assert client.get("/api/v2/health/ready").status_code == 200


def test_private_requires_auth(client):
    for path in ["/api/v2/access", "/api/v2/guardian/policy", "/api/v2/privacy", "/api/v2/snapshots/latest"]:
        assert client.get(path).status_code == 401


def test_spoofed_account_header_rejected(client):
    # X-Guardian-Account is no longer an authority boundary.
    assert client.get("/api/v2/access", headers={"X-Guardian-Account": "acc-x"}).status_code == 401


def test_access(client, auth_headers):
    headers, _ = auth_headers
    r = client.get("/api/v2/access", headers=headers)
    assert r.status_code == 200
    assert r.json()["level"] in ("FULL", "PAYWALL")


def test_snapshots_flow(client, auth_headers, session):
    headers, _ = auth_headers
    r = client.post(
        "/api/v2/snapshots",
        headers=headers,
        json={"snapshot_id": "s1", "snapshot_hash": "h1", "items": [{"id": "p1", "rating": 80}], "player_count": 1},
    )
    assert r.status_code == 200
    sid = r.json()["id"]
    assert client.get(f"/api/v2/snapshots/{sid}", headers=headers).status_code == 200
    assert client.get(f"/api/v2/snapshots/{sid}", headers={"X-Guardian-Account": "x"}).status_code == 401


def test_policy_flow(client, auth_headers):
    headers, _ = auth_headers
    assert client.get("/api/v2/guardian/policy", headers=headers).status_code == 200
    r = client.put(
        "/api/v2/guardian/policy",
        headers=headers,
        json={"protect_evolution_eligible": True},
    )
    assert r.json()["protect_evolution_eligible"] is True


def test_requirements_compile(client, auth_headers):
    headers, _ = auth_headers
    r = client.post(
        "/api/v2/requirements/compile",
        headers=headers,
        json={"segments": [{"constraints": {"min_team_rating": 82}}]},
    )
    assert r.status_code == 200
    assert r.json()["constraints"]["min_team_rating"] == 82


def _seed_fc26_snapshot(session, account_id, case):
    return repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h-trad",
        items=case["items"],
        edition="FC26",
        schema_version=1,
    )


def test_solve_traditional_endpoint(client, auth_headers, session):
    headers, account_id = auth_headers
    case = json.loads((FIX / "synthetic_fc26_traditional_v1.json").read_text())["cases"][0]
    snap = _seed_fc26_snapshot(session, account_id, case)
    session.commit()
    r = client.post(
        "/api/v2/solve/traditional",
        headers=headers,
        json={"request": case["request"], "policy": case.get("policy", {}), "snapshot_id": snap.id},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "SOLVED"
    assert len(r.json()["selected"]) == 11


def _seed_fc27_ruleset(session):
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
    session.commit()
    return rs, data


def test_solve_streamlined_endpoint(client, auth_headers, session):
    headers, account_id = auth_headers
    rs, data = _seed_fc27_ruleset(session)
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h-str",
        items=data["items"],
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    session.commit()
    r = client.post(
        "/api/v2/solve/streamlined",
        headers=headers,
        json={"snapshot_id": snap.id, "ruleset_version": data["ruleset_version"]},
    )
    assert r.status_code == 200
    selected = r.json()["selected"]
    assert selected
    server_points = {str(it["id"]): int(it.get("points", 0)) for it in data["items"]}
    assert r.json()["score"] == sum(server_points[i] for i in selected)


def test_privacy_flow(client, auth_headers):
    headers, _ = auth_headers
    assert client.get("/api/v2/privacy", headers=headers).status_code == 200
    r = client.put("/api/v2/privacy", headers=headers, json={"prefs": {"export_opt_in": False}})
    assert r.json()["prefs"]["export_opt_in"] is False


def test_solution_confirm_ownership(client, auth_headers, other_auth_headers, session):
    headers, account_id = auth_headers
    other_headers, _ = other_auth_headers
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash="h",
        items=[{"id": "a", "rating": 80}, {"id": "b", "rating": 80}],
        edition="FC26",
        schema_version=1,
    )
    sol = repo.create_solution(
        session,
        account_id,
        format="TRADITIONAL",
        challenge_id="c1",
        decision_id="dec-1",
        snapshot_hash="h",
        snapshot_id=snap.id,
        item_ids=["a", "b"],
    )
    session.commit()
    r = client.post(
        f"/api/v2/solutions/{sol.id}/confirm",
        headers=headers,
        json={"decision_id": "dec-1"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "CONFIRMED"

    # Foreign account cannot see/confirm the solution (fail-closed 404).
    bad = client.post(
        f"/api/v2/solutions/{sol.id}/confirm",
        headers=other_headers,
        json={"decision_id": "dec-1"},
    )
    assert bad.status_code == 404
