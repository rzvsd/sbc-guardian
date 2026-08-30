from __future__ import annotations

import re

from .player_item import PlayerItem

RARE_TOKENS = ("rare",)


def is_rare(item: PlayerItem) -> bool:
    return any(token in item.rarity.lower() for token in RARE_TOKENS)


def normalize_rarity(raw: str) -> str:
    """Collapse EA rarity strings into a small controlled vocabulary."""
    low = (raw or "").lower()
    if "rare" in low:
        return "RARE"
    if "special" in low:
        return "SPECIAL"
    return "COMMON"


def normalize_player(raw: dict) -> PlayerItem:
    """Anti-corruption entry point: EA snapshot dict -> normalized PlayerItem.

    Rejects any raw EA field (cookies, X-UT-SID, phishingToken, UT*, services, ...)."""
    lowered_keys = {re.sub(r"[^a-z0-9]", "", str(k).lower()) for k in raw}
    forbidden = {"cookies", "cookie", "xutsid", "utsid", "phishingtoken", "window", "dom", "services", "repositories"}
    if forbidden & lowered_keys or any("cookie" in key or "phishing" in key for key in lowered_keys):
        raise ValueError("raw EA secret field present in player snapshot")
    item_id = str(raw.get("id", "")).strip()
    if not item_id:
        raise ValueError("player id is required")
    rating = int(raw["rating"])
    if not 1 <= rating <= 99:
        raise ValueError("player rating must be between 1 and 99")
    scoring_category = str(raw.get("scoring_category", "")).strip().upper()
    if scoring_category and not re.fullmatch(r"[A-Z0-9][A-Z0-9_:-]{0,79}", scoring_category):
        raise ValueError("invalid scoring category")
    return PlayerItem(
        id=item_id,
        name=str(raw.get("name", "")),
        rating=rating,
        league=str(raw.get("league", "")),
        nation=str(raw.get("nation", "")),
        club=str(raw.get("club", "")),
        rarity=str(raw.get("rarity", "")),
        position=str(raw.get("position", "")),
        special=bool(raw.get("special", False)),
        duplicate=bool(raw.get("duplicate", False)),
        locked=bool(raw.get("locked", False)),
        excluded=bool(raw.get("excluded", False)),
        evolution_eligible=bool(raw.get("evolution_eligible", False)),
        points=int(raw.get("points", 0)),
        scoring_category=scoring_category,
    )
