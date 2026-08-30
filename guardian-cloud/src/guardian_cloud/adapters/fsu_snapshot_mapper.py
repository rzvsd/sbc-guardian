from __future__ import annotations

from typing import Any

from ..domain.player_item import PlayerItem
from ..domain.taxonomy import normalize_player


def map_fsu_snapshot(raw: dict[str, Any]) -> list[PlayerItem]:
    """FSU/EA snapshot -> normalized PlayerItem list. Rejects raw EA secrets."""
    items = raw.get("items") or raw.get("players") or []
    return [normalize_player(it) for it in items]
