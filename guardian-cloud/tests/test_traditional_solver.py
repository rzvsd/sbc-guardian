import json
from pathlib import Path

from guardian_cloud.domain.player_item import PlayerItem
from guardian_cloud.domain.requirements import check_solution, compile_case
from guardian_cloud.domain.traditional_solver import (
    STATUS_INFEASIBLE,
    STATUS_SOLVED,
    solve_traditional,
)

FIX = Path(__file__).parent / "fixtures" / "solver" / "synthetic_fc26_traditional_v1.json"


def _cases():
    return json.loads(FIX.read_text())["cases"]


def test_parity_expected_status():
    for case in _cases():
        res = solve_traditional(case)
        assert res.status == case["expected_status"], case["id"]


def test_solved_selection_meets_constraints():
    for case in _cases():
        if case["expected_status"] != STATUS_SOLVED:
            continue
        res = solve_traditional(case)
        compiled = compile_case(case)
        selected = [PlayerItem(**it) for it in case["items"] if it["id"] in set(res.selected)]
        assert check_solution(selected, compiled) is True


def test_infeasible_case_is_not_solved():
    case = next(c for c in _cases() if c["expected_status"] == STATUS_INFEASIBLE)
    res = solve_traditional(case)
    assert res.status == STATUS_INFEASIBLE
    assert res.selected == []


def test_fc26_chemistry_is_enforced():
    items = [
        {
            "id": f"p{index}",
            "rating": 80,
            "nation": "n1" if index < 8 else f"n{index}",
            "league": "l1" if index < 8 else f"l{index}",
            "club": "c1" if index < 7 else f"c{index}",
        }
        for index in range(11)
    ]
    case = {
        "items": items,
        "request": {"segments": [{"constraints": {"min_chemistry": 20}}]},
    }
    result = solve_traditional(case)
    assert result.status == STATUS_SOLVED
    selected = [PlayerItem(**item) for item in items if item["id"] in set(result.selected)]
    assert check_solution(selected, compile_case(case)) is True


def test_fc26_impossible_chemistry_is_infeasible():
    items = [
        {
            "id": f"p{index}",
            "rating": 80,
            "nation": f"n{index}",
            "league": f"l{index}",
            "club": f"c{index}",
        }
        for index in range(11)
    ]
    case = {
        "items": items,
        "request": {"segments": [{"constraints": {"min_chemistry": 1}}]},
    }
    assert solve_traditional(case).status == STATUS_INFEASIBLE
