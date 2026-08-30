from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..persistence import repository as repo
from .deps import get_session, require_product_access

router = APIRouter()


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision_id: str = Field(min_length=1, max_length=64)


@router.post("/api/v2/solutions/{solution_id}/confirm")
def confirm_solution(
    solution_id: str,
    body: DecisionIn,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    sol = repo.confirm_solution(session, account_id, solution_id, body.decision_id)
    return {"id": sol.id, "status": sol.status}


@router.post("/api/v2/solutions/{solution_id}/dismiss")
def dismiss_solution(
    solution_id: str,
    account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    sol = repo.dismiss_solution(session, account_id, solution_id)
    return {"id": sol.id, "status": sol.status}
