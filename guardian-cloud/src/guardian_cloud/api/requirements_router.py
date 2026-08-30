from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..domain.requirements import compile_segments
from .deps import get_session, require_product_access

router = APIRouter()


class CompileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segments: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/api/v2/requirements/compile")
def compile_requirements(
    body: CompileIn,
    _account_id: str = Depends(require_product_access),
    session: Session = Depends(get_session),
) -> dict:
    compiled = compile_segments(body.segments)
    return {"team_size": compiled.team_size, "constraints": compiled.constraints}
