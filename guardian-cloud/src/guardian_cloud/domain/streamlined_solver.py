from __future__ import annotations

from dataclasses import dataclass, field

from .player_item import PlayerItem
from .scoring import ScoringRuleset


@dataclass
class StreamlinedSuggestion:
    status: str = "INFEASIBLE"
    selected: list[str] = field(default_factory=list)
    score: int = 0


def solve_streamlined(
    items: list[PlayerItem],
    target_count: int | None = None,
    ruleset: ScoringRuleset | None = None,
    *,
    mode: str = "BALANCED",
    forbidden_selection: set[str] | None = None,
    policy=None,
) -> StreamlinedSuggestion:
    """Deterministic streamlined solver.

    Streamlined format has lighter constraints: pick the highest-value items
    (by ruleset points, then rating, then id) up to target_count (or all)."""
    rs = ruleset or ScoringRuleset(ruleset_version="v1")
    if mode not in {"DUPLICATE_FIRST", "BALANCED", "MINIMUM_ITEMS"}:
        return StreamlinedSuggestion(status="INFEASIBLE")
    pool = [it for it in items if not it.excluded and not it.locked]
    if policy is not None:
        pool = [it for it in pool if not policy.prefer_excluded(it)]
    if target_count is not None and (target_count < 1 or len(pool) < target_count):
        return StreamlinedSuggestion(status="INFEASIBLE")
    def order_key(it: PlayerItem):
        duplicate = 1 if it.duplicate else 0
        untradeable = 1 if not it.tradeable else 0
        if mode == "DUPLICATE_FIRST":
            return (-duplicate, -it.points, -it.rating, it.id)
        if mode == "MINIMUM_ITEMS":
            return (-it.points, -it.rating, -duplicate, it.id)
        prefer_duplicate = bool(getattr(policy, "prefer_duplicates", False)) if policy else False
        prefer_untradeable = bool(getattr(policy, "prefer_untradeable", False)) if policy else False
        return (-it.points, -it.rating, -duplicate if prefer_duplicate else 0,
                -untradeable if prefer_untradeable else 0, it.id)

    ordered = sorted(pool, key=order_key)
    if target_count is not None:
        ordered = ordered[:target_count]
    forbidden = set(forbidden_selection or ())
    if forbidden and set(it.id for it in ordered) == forbidden:
        candidates = []
        selected_ids = {it.id for it in ordered}
        for index in range(len(ordered) - 1, -1, -1):
            for replacement in pool:
                if replacement.id in selected_ids:
                    continue
                candidate = ordered[:]
                candidate[index] = replacement
                candidate = sorted(candidate, key=order_key)
                ids = {it.id for it in candidate}
                if ids != forbidden:
                    candidates.append(candidate)
        if not candidates:
            return StreamlinedSuggestion(status="INFEASIBLE")
        ordered = max(candidates, key=lambda candidate: (rs.score(candidate), tuple(sorted(it.id for it in candidate))))
    selected = [it.id for it in ordered]
    selected_items = [it for it in ordered]
    return StreamlinedSuggestion(status="SOLVED", selected=selected, score=rs.score(selected_items))
