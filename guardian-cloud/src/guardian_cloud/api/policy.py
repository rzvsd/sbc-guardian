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

    protect_evolution_eligible: bool = False
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
        protect_evolution_eligible=body.protect_evolution_eligible,
        allow_pack_opening=body.allow_pack_opening,
        max_solution_cost=body.max_solution_cost,
        notes=body.notes,
    )
    repo.put_policy(session, account_id, policy.to_dict())
    return policy.to_dict()
