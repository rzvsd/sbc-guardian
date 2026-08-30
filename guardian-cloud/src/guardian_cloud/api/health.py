from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/v2/health/live")
def health_live() -> dict:
    return {"status": "ok"}


@router.get("/api/v2/health/ready")
def health_ready() -> dict:
    return {"status": "ok"}
