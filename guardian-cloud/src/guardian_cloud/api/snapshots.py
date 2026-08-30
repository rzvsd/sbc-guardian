from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..domain.taxonomy import normalize_player
from ..persistence import repository as repo
from .deps import get_session, require_product_access

router = APIRouter()


class SnapshotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshot_id: str | None = None
    snapshot_hash: str
    items: list[dict] = Field(default_factory=list)
    player_count: int = 0
    edition: str = "FC26"
    schema_version: int = 1


@router.post("/api/v2/snapshots")
def post_snapshot(
    body: SnapshotIn,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    if (body.edition, body.schema_version) not in {("FC26", 1), ("FC27", 2)}:
        raise HTTPException(status_code=400, detail="unsupported snapshot edition/schema")
    normalized = []
    seen: set[str] = set()
    for raw in body.items:
        player = normalize_player(raw)
        if player.id in seen:
            raise HTTPException(status_code=400, detail="duplicate snapshot item id")
        seen.add(player.id)
        if body.edition == "FC27" and not player.scoring_category:
            raise HTTPException(status_code=400, detail="FC27 item taxonomy is unresolved")
        normalized.append(player.model_copy(update={"points": 0}).model_dump())
    if body.player_count not in (0, len(normalized)):
        raise HTTPException(status_code=400, detail="snapshot player count mismatch")
    snap = repo.save_snapshot(
        session,
        account_id,
        snapshot_hash=body.snapshot_hash,
        items=normalized,
        player_count=len(normalized),
        edition=body.edition,
        schema_version=body.schema_version,
        taxonomy_verified=False,
    )
    return {"id": snap.id, "snapshot_hash": snap.snapshot_hash}


@router.get("/api/v2/snapshots/latest")
def get_latest(
    account_id: str = Depends(require_product_access), session: Session = Depends(get_session)
) -> dict:
    snap = repo.latest_snapshot(session, account_id)
    if snap is None:
        raise HTTPException(status_code=404, detail="no snapshot")
    return {
        "id": snap.id,
        "snapshot_hash": snap.snapshot_hash,
        "player_count": snap.player_count,
        "edition": snap.edition,
        "schema_version": snap.schema_version,
        "taxonomy_verified": snap.taxonomy_verified,
    }


@router.get("/api/v2/snapshots/{snapshot_id}")
def get_one(
    snapshot_id: str,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    snap = repo.get_snapshot(session, account_id, snapshot_id)
    return {
        "id": snap.id,
        "snapshot_hash": snap.snapshot_hash,
        "player_count": snap.player_count,
        "edition": snap.edition,
        "schema_version": snap.schema_version,
        "taxonomy_verified": snap.taxonomy_verified,
    }
