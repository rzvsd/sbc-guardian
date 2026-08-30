from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .player_item import PlayerItem
from .taxonomy import is_rare

TEAM_SIZE = 11

KNOWN_CONSTRAINT_KEYS = {
    "min_team_rating",
    "min_chemistry",
    "min_player_rating",
    "max_player_rating",
    "min_distinct_leagues",
    "min_distinct_nations",
    "min_distinct_clubs",
    "max_players_same_league",
    "max_players_same_nation",
    "max_players_same_club",
    "min_rare_players",
    "min_special_players",
}


@dataclass
class CompiledRequirement:
    team_size: int = TEAM_SIZE
    constraints: dict[str, int] = field(default_factory=dict)

    def constraint(self, key: str) -> int | None:
        return self.constraints.get(key)


def compile_segments(segments: list[dict[str, Any]]) -> CompiledRequirement:
    """Flatten one or more SBC segments into a single requirement spec.

    Multiple segments are merged by taking the most restrictive bound per key
    (max of mins, min of maxes). No interpolation or fuzziness is applied."""
    if not isinstance(segments, list):
        raise ValueError("segments must be an array")

    merged: dict[str, int] = {}
    for seg in segments:
        if not isinstance(seg, dict):
            raise ValueError("each segment must be an object")
        cons = seg.get("constraints", {})
        if cons is None:
            cons = {}
        if not isinstance(cons, dict):
            raise ValueError("segment constraints must be an object")
        for key, value in cons.items():
            if key not in KNOWN_CONSTRAINT_KEYS:
                raise ValueError(f"unknown constraint: {key}")
            if type(value) is not int:
                raise ValueError(f"constraint {key} must be an integer")
            v = value
            if not _valid_constraint_value(key, v):
                raise ValueError(f"constraint {key} is outside the supported range")
            if key.startswith("min_") or key.startswith("max_"):
                # min_* -> keep largest; max_* -> keep smallest
                if key not in merged:
                    merged[key] = v
                elif key.startswith("min_"):
                    merged[key] = max(merged[key], v)
                else:
                    merged[key] = min(merged[key], v)
            else:
                merged[key] = v
    return CompiledRequirement(team_size=TEAM_SIZE, constraints=merged)


def compile_case(case: dict[str, Any]) -> CompiledRequirement:
    if not isinstance(case, dict):
        raise ValueError("solve request must be an object")
    request = case.get("request", {})
    if not isinstance(request, dict):
        raise ValueError("solve request requirements must be an object")
    segments = request.get("segments", [])
    return compile_segments(segments)


def _valid_constraint_value(key: str, value: int) -> bool:
    if key in {"min_team_rating", "min_player_rating", "max_player_rating"}:
        return 1 <= value <= 99
    if key == "min_chemistry":
        return 0 <= value <= TEAM_SIZE * 3
    if key in {
        "min_distinct_leagues",
        "min_distinct_nations",
        "min_distinct_clubs",
        "max_players_same_league",
        "max_players_same_nation",
        "max_players_same_club",
        "min_rare_players",
        "min_special_players",
    }:
        return 0 <= value <= TEAM_SIZE
    return False


def _distinct_count(selected: list[PlayerItem], attr: str) -> int:
    return len({getattr(it, attr) for it in selected if getattr(it, attr)})


def calculate_chemistry(selected: list[PlayerItem]) -> int:
    """Conservative FC26 base chemistry (no unverified hero/icon bonuses)."""
    thresholds = {"nation": (2, 5, 8), "league": (3, 5, 8), "club": (2, 4, 7)}
    counts: dict[str, dict[str, int]] = {key: {} for key in thresholds}
    for item in selected:
        for attr in thresholds:
            value = getattr(item, attr)
            if value:
                counts[attr][value] = counts[attr].get(value, 0) + 1

    def points(attr: str, value: str) -> int:
        count = counts[attr].get(value, 0)
        return sum(count >= threshold for threshold in thresholds[attr])

    return sum(
        min(3, sum(points(attr, getattr(item, attr)) for attr in thresholds if getattr(item, attr)))
        for item in selected
    )


def check_solution(selected: list[PlayerItem], compiled: CompiledRequirement) -> bool:
    """Validate a concrete selection against the compiled requirement.

    Pure, deterministic, no OR-Tools dependency. Used for parity checks."""
    if len(selected) != compiled.team_size:
        return False
    ids = [it.id for it in selected]
    if len(set(ids)) != len(ids):
        return False  # uniqueness between segments
    if any(it.excluded for it in selected):
        return False
    c = compiled.constraints
    rating_sum = sum(it.rating for it in selected)
    if "min_team_rating" in c and rating_sum < compiled.team_size * c["min_team_rating"]:
        return False
    if "min_chemistry" in c and calculate_chemistry(selected) < c["min_chemistry"]:
        return False
    if "min_player_rating" in c and any(it.rating < c["min_player_rating"] for it in selected):
        return False
    if "max_player_rating" in c and any(it.rating > c["max_player_rating"] for it in selected):
        return False
    if "min_distinct_leagues" in c and _distinct_count(selected, "league") < c["min_distinct_leagues"]:
        return False
    if "min_distinct_nations" in c and _distinct_count(selected, "nation") < c["min_distinct_nations"]:
        return False
    if "min_distinct_clubs" in c and _distinct_count(selected, "club") < c["min_distinct_clubs"]:
        return False
    if "max_players_same_league" in c:
        counts: dict[str, int] = {}
        for it in selected:
            if it.league:
                counts[it.league] = counts.get(it.league, 0) + 1
        if any(v > c["max_players_same_league"] for v in counts.values()):
            return False
    if "max_players_same_nation" in c:
        counts = {}
        for it in selected:
            if it.nation:
                counts[it.nation] = counts.get(it.nation, 0) + 1
        if any(v > c["max_players_same_nation"] for v in counts.values()):
            return False
    if "max_players_same_club" in c:
        counts = {}
        for it in selected:
            if it.club:
                counts[it.club] = counts.get(it.club, 0) + 1
        if any(v > c["max_players_same_club"] for v in counts.values()):
            return False
    if "min_rare_players" in c:
        if sum(1 for it in selected if is_rare(it)) < c["min_rare_players"]:
            return False
    if "min_special_players" in c:
        if sum(1 for it in selected if it.special) < c["min_special_players"]:
            return False
    return True
