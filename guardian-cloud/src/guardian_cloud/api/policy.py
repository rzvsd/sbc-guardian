from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..domain.guardian_policy import GuardianPolicy
from ..persistence import repository as repo
from .deps import get_session, require_product_access

router = APIRouter()


class PolicyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(default=2, ge=2, le=2)
    preset: str = Field(default="RECOMMENDED", pattern="^(RELAXED|RECOMMENDED|VERY_SAFE|CUSTOM)$")
    protect_favorites: bool = True
    protect_active_squad: bool = True
    protect_special: bool = False
    protect_evolution_eligible: bool = False
    protect_valuable_above: int | None = Field(default=None, ge=0)
    prefer_untradeable: bool = False
    prefer_duplicates: bool = False
    allow_pack_opening: bool = True
    max_solution_cost: int | None = None
    notes: dict[str, Any] = Field(default_factory=dict)


@router.get("/api/v2/guardian/policy")
def get_policy(account_id: str = Depends(require_product_access), session: Session = Depends(get_session)) -> dict:
    row = repo.get_policy(session, account_id)
    if row is None:
        return GuardianPolicy().to_dict()
    return json.loads(row.policy_json)


@router.put("/api/v2/guardian/policy")
def put_policy(
    body: PolicyIn, account_id: str = Depends(require_product_access), session: Session = Depends(get_session)
) -> dict:
    policy = GuardianPolicy(
        version=body.version,
        preset=body.preset,
        protect_favorites=body.protect_favorites,
        protect_active_squad=body.protect_active_squad,
        protect_special=body.protect_special,
        protect_evolution_eligible=body.protect_evolution_eligible,
        protect_valuable_above=body.protect_valuable_above,
        prefer_untradeable=body.prefer_untradeable,
        prefer_duplicates=body.prefer_duplicates,
        allow_pack_opening=body.allow_pack_opening,
        max_solution_cost=body.max_solution_cost,
        notes=body.notes,
    )
    repo.put_policy(session, account_id, policy.to_dict())
    return policy.to_dict()
