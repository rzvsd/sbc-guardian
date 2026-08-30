from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class GuardianPolicy:
    """Per-account Guardian policy. Only Guardian-owned knobs; no EA secrets."""

    protect_evolution_eligible: bool = False
    allow_pack_opening: bool = True
    max_solution_cost: int | None = None
    notes: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> GuardianPolicy:
        data = data or {}
        return cls(
            protect_evolution_eligible=bool(data.get("protect_evolution_eligible", False)),
            allow_pack_opening=bool(data.get("allow_pack_opening", True)),
            max_solution_cost=data.get("max_solution_cost"),
            notes={k: v for k, v in data.items() if k not in {"protect_evolution_eligible", "allow_pack_opening", "max_solution_cost"}},
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "protect_evolution_eligible": self.protect_evolution_eligible,
            "allow_pack_opening": self.allow_pack_opening,
        }
        if self.max_solution_cost is not None:
            out["max_solution_cost"] = self.max_solution_cost
        out.update(self.notes)
        return out

    def prefer_excluded(self, item) -> bool:
        """Soft hint: avoid evolution-eligible items when policy protects them."""
        return self.protect_evolution_eligible and bool(getattr(item, "evolution_eligible", False))
