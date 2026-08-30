from __future__ import annotations

from typing import Any

from .player_item import PlayerItem
from .requirements import check_solution, compile_case
from .traditional_solver import solve_traditional


def advise_traditional(case: dict[str, Any]) -> dict[str, Any]:
    """Deterministic advisory for a traditional case.

    Returns structured advice: whether a full solve is possible, and concrete
    candidate item ids to consider for the tightest failing bound."""
    result = solve_traditional(case)
    items = [PlayerItem(**raw) for raw in case.get("items", [])]
    compiled = compile_case(case)
    if result.status == "SOLVED":
        selected = [it for it in items if it.id in set(result.selected)]
        if check_solution(selected, compiled):
            return {"status": "SOLVED", "reasons": [], "candidates": []}
    reasons: list[str] = []
    candidates: list[str] = []
    c = compiled.constraints
    if c.get("min_rare_players") is not None:
        rare_pool = sorted(
            (it.id for it in items if "rare" in it.rarity.lower() and not it.excluded),
            key=lambda i: i,
        )
        reasons.append("need more RARE players")
        candidates.extend(rare_pool)
    if c.get("min_special_players") is not None:
        special_pool = sorted((it.id for it in items if it.special and not it.excluded), key=lambda i: i)
        reasons.append("need more SPECIAL players")
        candidates.extend(special_pool)
    return {"status": result.status, "reasons": reasons, "candidates": candidates[:11]}
