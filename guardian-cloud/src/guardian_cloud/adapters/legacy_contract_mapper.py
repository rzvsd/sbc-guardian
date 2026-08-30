from __future__ import annotations

from typing import Any


def legacy_challenge_to_v2(legacy: dict[str, Any]) -> dict[str, Any]:
    """Map a legacy backend challenge shape into the v2 contract shape.

    Only Guardian-owned fields are carried; no EA secrets."""
    return {
        "id": legacy.get("id"),
        "name": legacy.get("name"),
        "format": legacy.get("format", "TRADITIONAL"),
        "requirements": legacy.get("requirements", []),
    }


def legacy_snapshot_to_v2_request(
    legacy: dict[str, Any], *, game_edition: str, contract_version: int = 1
) -> dict[str, Any]:
    return {
        "contract_version": contract_version,
        "game_edition": game_edition,
        "snapshot_id": legacy.get("snapshot_id", ""),
        "snapshot_hash": legacy.get("snapshot_hash", ""),
        "format": legacy.get("format", "TRADITIONAL"),
        "challenge": legacy_challenge_to_v2(legacy.get("challenge", {})),
    }
