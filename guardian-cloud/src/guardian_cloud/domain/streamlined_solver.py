from __future__ import annotations

from dataclasses import dataclass, field

from .player_item import PlayerItem
from .scoring import ScoringRuleset


@dataclass
class StreamlinedSuggestion:
    selected: list[str] = field(default_factory=list)
    score: int = 0


def solve_streamlined(
    items: list[PlayerItem],
    target_count: int | None = None,
    ruleset: ScoringRuleset | None = None,
) -> StreamlinedSuggestion:
    """Deterministic streamlined solver.

    Streamlined format has lighter constraints: pick the highest-value items
    (by ruleset points, then rating, then id) up to target_count (or all)."""
    rs = ruleset or ScoringRuleset(ruleset_version="v1")
    pool = [it for it in items if not it.excluded]
    ordered = sorted(pool, key=lambda it: (-it.points, -it.rating, it.id))
    if target_count is not None:
        ordered = ordered[:target_count]
    selected = [it.id for it in ordered]
    selected_items = [it for it in ordered]
    return StreamlinedSuggestion(selected=selected, score=rs.score(selected_items))
