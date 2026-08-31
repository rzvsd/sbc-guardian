from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

try:
    from ortools.sat.python import cp_model as cp
except Exception:  # pragma: no cover - ortools is a declared dependency
    cp = None  # type: ignore

from .guardian_policy import GuardianPolicy
from .player_item import PlayerItem
from .requirements import compile_case
from .taxonomy import is_rare, normalize_player

STATUS_SOLVED = "SOLVED"
STATUS_INFEASIBLE = "INFEASIBLE"
STATUS_TIMEOUT = "TIMEOUT"


@dataclass
class SolveResult:
    status: str
    selected: list[str] = field(default_factory=list)
    rating_sum: int = 0


def _items_from_case(case: dict[str, Any]) -> list[PlayerItem]:
    out: list[PlayerItem] = []
    for raw in case.get("items", []):
        # normalize_player enforces the anti-corruption boundary (rejects raw EA secrets)
        out.append(normalize_player(raw))
    return out


def solve_traditional(case: dict[str, Any]) -> SolveResult:
    """Deterministic traditional SBC solver.

    Uses OR-Tools CP-SAT with a single search worker so the same input always
    yields the same selection (no interpolation/fuzzy/fallback)."""
    if cp is None:
        raise RuntimeError("ortools unavailable")
    items = _items_from_case(case)
    compiled = compile_case(case)
    policy = GuardianPolicy.from_dict(case.get("policy"))
    n = len(items)
    team_size = compiled.team_size

    model = cp.CpModel()
    x = [model.new_bool_var(f"x{i}") for i in range(n)]
    model.add(sum(x) == team_size)

    for i, it in enumerate(items):
        if it.locked:
            model.add(x[i] == 0)
        if it.excluded:
            model.add(x[i] == 0)

    c = compiled.constraints
    min_pr = c.get("min_player_rating")
    max_pr = c.get("max_player_rating")
    if min_pr is not None:
        for i, it in enumerate(items):
            if it.rating < min_pr:
                model.add(x[i] == 0)
    if max_pr is not None:
        for i, it in enumerate(items):
            if it.rating > max_pr:
                model.add(x[i] == 0)

    mtr = c.get("min_team_rating")
    if mtr is not None:
        model.add(sum(x[i] * it.rating for i, it in enumerate(items)) >= team_size * mtr)

    min_chemistry = c.get("min_chemistry")
    if min_chemistry is not None:
        levels: dict[str, dict[str, Any]] = {}
        for attr, thresholds in {
            "nation": (2, 5, 8),
            "league": (3, 5, 8),
            "club": (2, 4, 7),
        }.items():
            groups: dict[str, list[int]] = {}
            for index, item in enumerate(items):
                value = getattr(item, attr)
                if value:
                    groups.setdefault(value, []).append(index)
            levels[attr] = {}
            for value, indexes in groups.items():
                count = sum(x[index] for index in indexes)
                indicators = []
                for tier, threshold in enumerate(thresholds, start=1):
                    indicator = model.new_bool_var(f"chem_{attr}_{value}_{tier}")
                    model.add(count >= threshold).only_enforce_if(indicator)
                    model.add(count < threshold).only_enforce_if(indicator.Not())
                    indicators.append(indicator)
                levels[attr][value] = sum(indicators)

        chemistry = []
        for index, item in enumerate(items):
            raw = sum(
                levels[attr].get(getattr(item, attr), 0)
                for attr in ("nation", "league", "club")
            )
            points = model.new_int_var(0, 3, f"chem_item_{index}")
            model.add(points <= raw)
            model.add(points <= 3 * x[index])
            chemistry.append(points)
        model.add(sum(chemistry) >= min_chemistry)

    def add_distinct(attr: str, key: str) -> None:
        val = c.get(key)
        if val is None:
            return
        groups: dict[str, list[int]] = {}
        for i, it in enumerate(items):
            g = getattr(it, attr)
            if g:
                groups.setdefault(g, []).append(i)
        ys = [model.new_bool_var(f"{attr}_y{k}") for k in groups]
        for yk, idxs in zip(ys, groups.values(), strict=True):
            model.add(yk <= sum(x[i] for i in idxs))
        model.add(sum(ys) >= val)

    def add_max_same(attr: str, key: str) -> None:
        val = c.get(key)
        if val is None:
            return
        groups: dict[str, list[int]] = {}
        for i, it in enumerate(items):
            g = getattr(it, attr)
            if g:
                groups.setdefault(g, []).append(i)
        for idxs in groups.values():
            model.add(sum(x[i] for i in idxs) <= val)

    add_distinct("league", "min_distinct_leagues")
    add_distinct("nation", "min_distinct_nations")
    add_distinct("club", "min_distinct_clubs")
    add_max_same("league", "max_players_same_league")
    add_max_same("nation", "max_players_same_nation")
    add_max_same("club", "max_players_same_club")

    mr = c.get("min_rare_players")
    if mr is not None:
        rare = [i for i, it in enumerate(items) if is_rare(it)]
        model.add(sum(x[i] for i in rare) >= mr)
    ms = c.get("min_special_players")
    if ms is not None:
        special = [i for i, it in enumerate(items) if it.special]
        model.add(sum(x[i] for i in special) >= ms)

    if policy.protect_evolution_eligible:
        evo = [i for i, it in enumerate(items) if it.evolution_eligible]
        model.minimize(sum(x[i] for i in evo))
    else:
        model.minimize(sum(x[i] * it.rating for i, it in enumerate(items)))

    solver = cp.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    solver.parameters.num_search_workers = 1
    status = solver.solve(model)
    name = solver.status_name(status)
    if name in ("OPTIMAL", "FEASIBLE"):
        selected = [items[i].id for i in range(n) if solver.value(x[i]) == 1]
        rating_sum = sum(items[i].rating for i in range(n) if solver.value(x[i]) == 1)
        return SolveResult(STATUS_SOLVED, selected, rating_sum)
    if name == "INFEASIBLE":
        return SolveResult(STATUS_INFEASIBLE, [])
    return SolveResult(STATUS_TIMEOUT, [])
