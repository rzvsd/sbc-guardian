import json
from pathlib import Path

from guardian_cloud.domain.player_item import PlayerItem
from guardian_cloud.domain.scoring import ScoringRuleset
from guardian_cloud.domain.streamlined_solver import solve_streamlined

FIX = Path(__file__).parent / "fixtures" / "solver" / "synthetic_fc27_streamlined_v1.json"


def test_fc27_exact_points_and_determinism():
    data = json.loads(FIX.read_text())
    items = [PlayerItem(**it) for it in data["items"]]
    rs = ScoringRuleset(ruleset_version=data["ruleset_version"], edition=data["edition"])
    first = solve_streamlined(items, ruleset=rs)
    second = solve_streamlined(items, ruleset=rs)
    assert first.score == 4 + 6 + 3
    assert first.selected == second.selected


def test_locked_items_are_never_selected():
    items = [
        PlayerItem(id="locked", rating=99, points=999, locked=True),
        PlayerItem(id="safe", rating=80, points=1),
    ]
    result = solve_streamlined(
        items,
        target_count=1,
        ruleset=ScoringRuleset(edition="FC27", ruleset_version="v1"),
    )
    assert result.selected == ["safe"]


def test_streamlined_mode_and_no_good_produce_a_different_selection():
    items = [
        PlayerItem(id="a", rating=90, points=10, duplicate=False),
        PlayerItem(id="b", rating=89, points=9, duplicate=True),
        PlayerItem(id="c", rating=88, points=8, duplicate=True),
    ]
    rs = ScoringRuleset(edition="FC27", ruleset_version="v1")
    first = solve_streamlined(items, target_count=2, ruleset=rs, mode="DUPLICATE_FIRST")
    alternative = solve_streamlined(
        items,
        target_count=2,
        ruleset=rs,
        mode="DUPLICATE_FIRST",
        forbidden_selection=set(first.selected),
    )
    assert first.status == alternative.status == "SOLVED"
    assert set(alternative.selected) != set(first.selected)
