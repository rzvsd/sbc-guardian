from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..persistence import repository as repo
from .deps import get_session, get_session_account

router = APIRouter()


@router.get("/api/v2/account/export")
def export_account(account_id: str = Depends(get_session_account), session: Session = Depends(get_session)) -> dict:
    return repo.export_account(session, account_id)


@router.delete("/api/v2/account")
def delete_account(account_id: str = Depends(get_session_account), session: Session = Depends(get_session)) -> dict:
    account = repo.get_account(session, account_id)
    if account is not None and account.role == "PRINCIPAL_ADMIN":
        raise HTTPException(status_code=409, detail="principal admin is immutable")
    repo.delete_account(session, account_id)
    return {"deleted": account_id}
