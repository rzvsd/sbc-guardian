from __future__ import annotations

from pydantic import BaseModel


class PlayerItem(BaseModel):
    """Normalized Guardian player item. Never carries raw EA secrets (cookies, X-UT-SID, ...)."""

    id: str
    name: str = ""
    rating: int
    league: str = ""
    nation: str = ""
    club: str = ""
    rarity: str = ""
    position: str = ""
    special: bool = False
    duplicate: bool = False
    locked: bool = False
    excluded: bool = False
    evolution_eligible: bool = False
    favorite: bool = False
    in_active_squad: bool = False
    tradeable: bool = True
    market_value_coins: int | None = None
    valuation_source: str | None = None
    valued_at: str | None = None
    points: int = 0
    scoring_category: str = ""

    model_config = {"extra": "forbid"}
