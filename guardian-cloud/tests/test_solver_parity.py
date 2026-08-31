import json
from pathlib import Path

from guardian_cloud.domain.traditional_solver import solve_traditional

FIX = Path(__file__).parent / "fixtures" / "solver" / "synthetic_fc26_traditional_v1.json"


def _case(idx: int = 0) -> dict:
    return json.loads(FIX.read_text())["cases"][idx]


def test_determinism():
    case = _case(0)
    assert solve_traditional(case).selected == solve_traditional(case).selected


def test_uniqueness_and_subset_of_input():
    case = _case(0)
    res = solve_traditional(case)
    assert len(set(res.selected)) == len(res.selected)
    ids = {it["id"] for it in case["items"]}
    assert set(res.selected).issubset(ids)


def test_locked_and_excluded_are_absent():
    case = {
        "request": {
            "segments": [
                {"constraints": {"min_team_rating": 80, "max_player_rating": 85, "min_distinct_leagues": 2}}
            ]
        },
        "policy": {},
        "items": [
            {"id": "L1", "rating": 82, "league": "LA", "nation": "NA", "club": "CA", "locked": True},
            {"id": "X1", "rating": 82, "league": "LA", "nation": "NA", "club": "CA", "excluded": True},
            {"id": "P2", "rating": 82, "league": "LB", "nation": "NB", "club": "CB"},
        ]
        + [
            {"id": f"F{i}", "rating": 82, "league": f"L{i}", "nation": f"N{i}", "club": f"C{i}"}
            for i in range(3, 14)
        ],
    }
    res = solve_traditional(case)
    assert res.status == "SOLVED"
    assert "L1" not in res.selected
    assert "X1" not in res.selected


def test_no_interpolation_uses_only_input_items():
    case = _case(1)  # contradictory -> INFEASIBLE
    res = solve_traditional(case)
    assert res.status == "INFEASIBLE"
    assert res.selected == []
