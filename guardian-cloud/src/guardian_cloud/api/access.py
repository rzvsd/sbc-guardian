from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..domain import access as access_domain
from ..persistence import repository
from .deps import get_session, get_session_account

router = APIRouter()


@router.get("/api/v2/access")
def access(account_id: str = Depends(get_session_account), session: Session = Depends(get_session)) -> dict:
    account = repository.get_account(session, account_id)
    entitlement = repository.get_latest_entitlement(session, account_id)
    level = access_domain.compute_access(
        account.role if account else "SUBSCRIBER",
        entitlement.state if entitlement else None,
        entitlement.until if entitlement else None,
    )
    return {
        "account_id": account_id,
        "role": account.role if account else "SUBSCRIBER",
        "level": level,
        "plans": [entitlement.plan] if entitlement and level != "PAYWALL" else [],
        "entitlement_state": entitlement.state if entitlement else None,
    }
