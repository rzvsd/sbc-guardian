from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PRESETS = {
    "RELAXED": dict(protect_favorites=True, protect_active_squad=True, protect_special=False, protect_evolution_eligible=False),
    "RECOMMENDED": dict(protect_favorites=True, protect_active_squad=True, protect_special=True, protect_evolution_eligible=True),
    "VERY_SAFE": dict(protect_favorites=True, protect_active_squad=True, protect_special=True, protect_evolution_eligible=True, prefer_untradeable=True),
}


def policy_for_preset(name: str) -> GuardianPolicy:
    key = str(name).upper()
    if key not in PRESETS:
        raise ValueError("unknown Guardian policy preset")
    return GuardianPolicy(preset=key, **PRESETS[key])


@dataclass
class GuardianPolicy:
    """Per-account Guardian policy. Only Guardian-owned knobs; no EA secrets."""

    version: int = 2
    preset: str = "RECOMMENDED"
    protect_favorites: bool = True
    protect_active_squad: bool = True
    protect_special: bool = False
    protect_evolution_eligible: bool = False
    protect_valuable_above: int | None = None
    prefer_untradeable: bool = False
    prefer_duplicates: bool = False
    allow_pack_opening: bool = True
    max_solution_cost: int | None = None
    notes: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> GuardianPolicy:
        data = data or {}
        return cls(
            version=int(data.get("version", 2)),
            preset=str(data.get("preset", "RECOMMENDED")).upper(),
            protect_favorites=bool(data.get("protect_favorites", True)),
            protect_active_squad=bool(data.get("protect_active_squad", True)),
            protect_special=bool(data.get("protect_special", False)),
            protect_evolution_eligible=bool(data.get("protect_evolution_eligible", False)),
            protect_valuable_above=data.get("protect_valuable_above"),
            prefer_untradeable=bool(data.get("prefer_untradeable", False)),
            prefer_duplicates=bool(data.get("prefer_duplicates", False)),
            allow_pack_opening=bool(data.get("allow_pack_opening", True)),
            max_solution_cost=data.get("max_solution_cost"),
            notes={k: v for k, v in data.items() if k not in {"protect_evolution_eligible", "allow_pack_opening", "max_solution_cost"}},
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "version": 2,
            "preset": self.preset,
            "protect_favorites": self.protect_favorites,
            "protect_active_squad": self.protect_active_squad,
            "protect_special": self.protect_special,
            "protect_evolution_eligible": self.protect_evolution_eligible,
            "protect_valuable_above": self.protect_valuable_above,
            "prefer_untradeable": self.prefer_untradeable,
            "prefer_duplicates": self.prefer_duplicates,
            "allow_pack_opening": self.allow_pack_opening,
        }
        if self.max_solution_cost is not None:
            out["max_solution_cost"] = self.max_solution_cost
        out.update(self.notes)
        return out

    def prefer_excluded(self, item) -> bool:
        """Soft hint: avoid evolution-eligible items when policy protects them."""
        return (
            (self.protect_evolution_eligible and bool(getattr(item, "evolution_eligible", False)))
            or (self.protect_favorites and bool(getattr(item, "favorite", False)))
            or (self.protect_active_squad and bool(getattr(item, "in_active_squad", False)))
            or (self.protect_special and bool(getattr(item, "special", False)))
            or (self.protect_valuable_above is not None and (getattr(item, "market_value_coins", None) or 0) > self.protect_valuable_above)
        )
