from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..persistence import repository as repo
from .deps import get_session, get_session_account

router = APIRouter()


class PrivacyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prefs: dict[str, Any] = Field(default_factory=dict)


@router.get("/api/v2/privacy")
def get_privacy(account_id: str = Depends(get_session_account), session: Session = Depends(get_session)) -> dict:
    row = repo.get_privacy(session, account_id)
    if row is None:
        return {"prefs": {}}
    return {"prefs": json.loads(row.prefs_json)}


@router.put("/api/v2/privacy")
def put_privacy(body: PrivacyIn, account_id: str = Depends(get_session_account), session: Session = Depends(get_session)) -> dict:
    repo.put_privacy(session, account_id, body.prefs)
    return {"prefs": body.prefs}
