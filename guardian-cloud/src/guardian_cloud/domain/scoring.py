from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .player_item import PlayerItem


@dataclass(frozen=True)
class ScoringRuleset:
    ruleset_version: str = "v1"
    taxonomy_version: int = 1
    edition: str = "FC26"

    def score(self, items: list[PlayerItem]) -> int:
        """Deterministic, exact scoring. No interpolation/fuzzy/fallback.

        FC27 uses explicit per-item `points`; other editions fall back to rating sum."""
        if self.edition == "FC27":
            return sum(int(it.points) for it in items)
        return sum(int(it.rating) for it in items)


def active_ruleset_for(edition: str, spec: dict[str, Any] | None = None) -> ScoringRuleset:
    spec = spec or {}
    return ScoringRuleset(
        ruleset_version=str(spec.get("ruleset_version", "v1")),
        taxonomy_version=int(spec.get("taxonomy_version", 1)),
        edition=edition,
    )
