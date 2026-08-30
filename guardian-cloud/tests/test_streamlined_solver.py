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
