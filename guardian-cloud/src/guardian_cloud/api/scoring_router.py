from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..persistence import repository as repo
from .deps import get_session, require_product_access

router = APIRouter()


@router.get("/api/v2/scoring-rulesets/active")
def active_ruleset(
    edition: Literal["FC26", "FC27"] = Query("FC26"),
    _account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    row = repo.active_ruleset(session, edition)
    if row is None:
        raise HTTPException(status_code=404, detail="no active ruleset")
    return {
        "id": row.id,
        "edition": row.edition,
        "ruleset_version": row.ruleset_version,
        "taxonomy_version": row.taxonomy_version,
        "weights": json.loads(row.weights_json),
        "active": row.active,
    }
