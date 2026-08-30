from __future__ import annotations

from typing import Any

from .player_item import PlayerItem
from .streamlined_solver import solve_streamlined


def advise_streamlined(
    items: list[PlayerItem], target_count: int | None = None
) -> dict[str, Any]:
    """Streamlined advisory: which items maximize score within the target count."""
    suggestion = solve_streamlined(items, target_count)
    return {
        "selected": suggestion.selected,
        "score": suggestion.score,
        "note": "select highest points within target; deterministic",
    }
