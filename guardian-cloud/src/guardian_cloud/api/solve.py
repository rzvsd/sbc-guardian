from __future__ import annotations

import json
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..domain.requirements import check_solution, compile_case
from ..domain.scoring import ScoringRuleset
from ..domain.streamlined_solver import solve_streamlined
from ..domain.taxonomy import normalize_player
from ..domain.traditional_solver import solve_traditional
from ..persistence import repository as repo
from .deps import get_session, require_product_access

router = APIRouter()


class SolveTraditionalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request: dict[str, Any]
    policy: dict[str, Any] = Field(default_factory=dict)
    snapshot_id: str
    # Optional for compatibility with pre-v2 clients. New clients should send
    # the hash so a stale read cannot be solved accidentally.
    snapshot_hash: str | None = None
    challenge_id: str | None = None


class SolveStreamlinedIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshot_id: str = Field(min_length=1)
    # Optional for compatibility with pre-v2 clients; when present it is
    # always checked against the immutable server snapshot.
    snapshot_hash: str | None = None
    target_count: int | None = Field(default=None, ge=1, le=50)
    ruleset_version: str | None = Field(default=None, min_length=1, max_length=64)


def _consumed_ids(session: Session, account_id: str) -> set[str]:
    return repo.confirmed_item_ids(session, account_id)


def _validate_selection(
    selected: list[str],
    available_ids: set[str],
    consumed: set[str],
    *,
    players: list | None = None,
    compiled=None,
) -> None:
    if not selected or len(selected) != len(set(selected)):
        raise HTTPException(status_code=422, detail="solver returned invalid item selection")
    if not set(selected).issubset(available_ids) or set(selected) & consumed:
        raise HTTPException(status_code=422, detail="solver returned item outside eligible snapshot")
    if players is not None and compiled is not None:
        selected_ids = set(selected)
        if any(player.locked and player.id in selected_ids for player in players):
            raise HTTPException(status_code=422, detail="solver selected a locked item")
        selected_items = [player for player in players if player.id in selected_ids]
        if not check_solution(selected_items, compiled):
            raise HTTPException(status_code=422, detail="solver returned a solution that fails requirements")


@router.post("/api/v2/solve/traditional")
def solve_traditional_endpoint(
    body: SolveTraditionalIn,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    repo.lock_account(session, account_id)
    # Inventory is loaded ONLY from the owned, immutable snapshot.
    snap = repo.get_snapshot(session, account_id, body.snapshot_id)
    if body.snapshot_hash is not None and body.snapshot_hash != snap.snapshot_hash:
        raise HTTPException(status_code=409, detail="snapshot hash conflict")
    if snap.edition != "FC26":
        raise HTTPException(status_code=400, detail="snapshot edition mismatch")
    if snap.schema_version != 1:
        raise HTTPException(status_code=400, detail="unsupported schema version")

    raw_items = repo.get_snapshot_items(session, account_id, body.snapshot_id)
    consumed = _consumed_ids(session, account_id)
    players = [normalize_player(it) for it in raw_items if str(it.get("id")) not in consumed]
    policy_row = repo.get_policy(session, account_id)
    policy = {} if policy_row is None else json.loads(policy_row.policy_json)
    case = {
        "request": body.request,
        "policy": policy,
        "items": [p.model_dump() for p in players],
    }
    result = solve_traditional(case)
    if result.status == "SOLVED":
        compiled = compile_case(case)
        _validate_selection(
            result.selected,
            {player.id for player in players},
            consumed,
            players=players,
            compiled=compiled,
        )
        expected_rating_sum = sum(player.rating for player in players if player.id in set(result.selected))
        if result.rating_sum != expected_rating_sum:
            raise HTTPException(status_code=422, detail="solver returned an invalid rating sum")
        decision_id = secrets.token_urlsafe(24)
        solution = repo.create_solution(
            session,
            account_id,
            format="TRADITIONAL",
            challenge_id=body.challenge_id,
            decision_id=decision_id,
            snapshot_hash=snap.snapshot_hash,
            snapshot_id=snap.id,
            edition="FC26",
            item_ids=result.selected,
        )
        return {
            "status": "SOLVED",
            "selected": result.selected,
            "rating_sum": result.rating_sum,
            "solution_id": solution.id,
            "decision_id": decision_id,
        }
    # INFEASIBLE / TIMEOUT / INVALID are never persisted.
    return {"status": result.status, "selected": [], "rating_sum": 0}


@router.post("/api/v2/solve/streamlined")
def solve_streamlined_endpoint(
    body: SolveStreamlinedIn,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    repo.lock_account(session, account_id)
    # Inventory is loaded ONLY from the owned, immutable FC27 v2 snapshot.
    snap = repo.get_snapshot(session, account_id, body.snapshot_id)
    if body.snapshot_hash is not None and body.snapshot_hash != snap.snapshot_hash:
        raise HTTPException(status_code=409, detail="snapshot hash conflict")
    if snap.edition != "FC27":
        raise HTTPException(status_code=400, detail="snapshot edition mismatch")
    if snap.schema_version != 2:
        raise HTTPException(status_code=400, detail="unsupported schema version")
    if not snap.taxonomy_verified:
        raise HTTPException(status_code=409, detail="FC27 snapshot taxonomy is not verified")

    # Exact ACTIVE FC27 ruleset, resolved server-side (no client fallback).
    ruleset = repo.active_ruleset(session, "FC27")
    if ruleset is None:
        raise HTTPException(status_code=409, detail="no active FC27 ruleset")
    if ruleset.taxonomy_version != snap.schema_version:
        raise HTTPException(status_code=409, detail="taxonomy version conflict")
    if body.ruleset_version != ruleset.ruleset_version:
        raise HTTPException(status_code=409, detail="ruleset version conflict")

    raw_items = repo.get_snapshot_items(session, account_id, body.snapshot_id)
    consumed = _consumed_ids(session, account_id)
    players = []
    for it in raw_items:
        item_id = str(it.get("id"))
        if item_id in consumed:
            continue
        # Authoritative points come from the server-side ruleset, never the client.
        category = str(it.get("scoring_category", ""))
        pts = repo.get_ruleset_entry_points(session, ruleset.id, int(it.get("rating", 0)), category)
        if pts is None:
            raise HTTPException(status_code=422, detail="unscorable item in snapshot")
        players.append(normalize_player({**it, "points": pts}))

    suggestion = solve_streamlined(
        players,
        body.target_count,
        ScoringRuleset(edition="FC27", ruleset_version=ruleset.ruleset_version),
    )
    selected = suggestion.selected
    if selected:
        _validate_selection(selected, {player.id for player in players}, consumed)

    # Revalidate the ruleset is still active before persisting (race guard).
    current = repo.active_ruleset(session, "FC27")
    if (
        current is None
        or current.id != ruleset.id
        or current.taxonomy_version != snap.schema_version
    ):
        raise HTTPException(status_code=409, detail="ruleset changed during solve")

    for player in players:
        exact = repo.get_ruleset_entry_points(
            session, current.id, player.rating, player.scoring_category
        )
        if exact != player.points:
            raise HTTPException(status_code=409, detail="ruleset changed during solve")

    if selected:
        decision_id = secrets.token_urlsafe(24)
        solution = repo.create_solution(
            session,
            account_id,
            format="STREAMLINED",
            challenge_id=None,
            decision_id=decision_id,
            snapshot_hash=snap.snapshot_hash,
            snapshot_id=snap.id,
            ruleset_id=ruleset.id,
            edition="FC27",
            ruleset_version=ruleset.ruleset_version,
            item_ids=selected,
        )
    response = {
        "selected": selected,
        "score": suggestion.score,
        "edition": "FC27",
        "ruleset_version": ruleset.ruleset_version,
    }
    if selected:
        response.update({"solution_id": solution.id, "decision_id": decision_id})
    return response
