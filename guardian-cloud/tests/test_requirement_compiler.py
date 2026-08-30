from guardian_cloud.domain.player_item import PlayerItem
from guardian_cloud.domain.requirements import TEAM_SIZE, check_solution, compile_segments


def test_compile_merges_min_and_max():
    c = compile_segments(
        [
            {"constraints": {"min_team_rating": 80, "max_player_rating": 85}},
            {"constraints": {"min_team_rating": 82, "max_player_rating": 84}},
        ]
    )
    assert c.constraints["min_team_rating"] == 82
    assert c.constraints["max_player_rating"] == 84
    assert c.team_size == TEAM_SIZE


def test_check_solution_valid_and_rejects_duplicates():
    items = [
        PlayerItem(id=f"p{i}", rating=83, league=f"L{i % 3}", nation=f"N{i % 2}", club=f"C{i}")
        for i in range(11)
    ]
    c = compile_segments([{"constraints": {"min_team_rating": 80, "min_distinct_leagues": 3}}])
    assert check_solution(items, c) is True
    assert check_solution(items + [items[0]], c) is False
    assert check_solution(items[:10], c) is False
