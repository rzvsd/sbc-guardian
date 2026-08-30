from guardian_cloud.domain.player_item import PlayerItem
from guardian_cloud.domain.scoring import ScoringRuleset


def test_fc27_scores_on_points():
    items = [PlayerItem(id="a", rating=84, points=4), PlayerItem(id="b", rating=86, points=3)]
    assert ScoringRuleset(edition="FC27").score(items) == 7


def test_fc26_scores_on_rating_sum():
    items = [PlayerItem(id="a", rating=84), PlayerItem(id="b", rating=86)]
    assert ScoringRuleset(edition="FC26").score(items) == 170
