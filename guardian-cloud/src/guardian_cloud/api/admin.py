from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..api import deps
from ..persistence import repository
from ..persistence.models import AuditEvent, ClubSnapshot, ScoringEntry

router = APIRouter(prefix="/api/v2/admin", tags=["admin"])


@router.get("/users")
def list_users(admin_id: str = Depends(deps.require_admin), session: Session = Depends(deps.get_session)):
    from ..persistence.models import Account

    rows = session.execute(select(Account)).scalars().all()
    return [
        {"account_id": a.id, "email": a.email, "role": a.role, "status": a.status}
        for a in rows
    ]


@router.get("/users/{account_id}")
def user_detail(
    account_id: str,
    admin_id: str = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    account = repository.get_account(session, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="account not found")
    return {"account_id": account.id, "email": account.email, "role": account.role, "status": account.status}


class RoleChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["ADMIN", "SUBSCRIBER"]
    reason: str = Field(min_length=8, max_length=300)


@router.post("/users/{account_id}/role")
def change_role(
    account_id: str,
    body: RoleChange,
    admin_id: str = Depends(deps.require_principal),
    session: Session = Depends(deps.get_session),
):
    try:
        account = repository.set_account_role(session, account_id, body.role)
    except PermissionError:
        raise HTTPException(status_code=400, detail="principal admin is immutable") from None
    repository.record_audit(
        session, admin_id, "role_change", account_id, f"{body.role}:{body.reason}"
    )
    return {"account_id": account.id, "role": account.role}


@router.post("/users/{account_id}/revoke")
def revoke_account(
    account_id: str,
    admin_id: str = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    target = repository.get_account(session, account_id)
    if target is None:
        raise HTTPException(status_code=404, detail="account not found")
    if target.role == "PRINCIPAL_ADMIN":
        raise HTTPException(status_code=400, detail="principal admin cannot be revoked")
    repository.revoke_all_device_sessions(session, account_id)
    repository.record_audit(session, admin_id, "revoke_sessions", account_id, "admin revoke")
    return {"ok": True, "revoked_sessions": True}


class EntitlementChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: Literal["TRIAL", "ACTIVE", "GRACE", "ON_HOLD", "EXPIRED", "CANCELED"]
    plan: str = Field(min_length=1, max_length=64)
    until: datetime | None = None
    reason: str = Field(min_length=8, max_length=300)


@router.post("/users/{account_id}/entitlement")
def change_entitlement(
    account_id: str,
    body: EntitlementChange,
    admin_id: str = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    if repository.get_account(session, account_id) is None:
        raise HTTPException(status_code=404, detail="account not found")
    row = repository.set_entitlement(
        session,
        account_id,
        plan=body.plan,
        state=body.state,
        until=body.until,
        reason="admin:" + body.reason.strip(),
    )
    repository.record_audit(
        session, admin_id, "entitlement_change", account_id, f"{body.state}:{body.reason.strip()}"
    )
    return {"id": row.id, "state": row.state, "plan": row.plan}


@router.get("/audit")
def list_audit(
    _admin_id: str = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    rows = session.execute(select(AuditEvent).order_by(AuditEvent.ts.desc()).limit(200)).scalars()
    return [
        {"id": row.id, "actor_id": row.account_id, "action": row.action, "detail": row.detail, "ts": row.ts}
        for row in rows
    ]


class TaxonomyVerification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignments: dict[str, str]
    reason: str = Field(min_length=8, max_length=300)


@router.post("/users/{account_id}/snapshots/{snapshot_id}/verify-taxonomy", status_code=201)
def verify_taxonomy(
    account_id: str,
    snapshot_id: str,
    body: TaxonomyVerification,
    admin_id: str = Depends(deps.require_admin),
    session: Session = Depends(deps.get_session),
):
    source = session.get(ClubSnapshot, snapshot_id)
    if source is None or source.account_id != account_id:
        raise HTTPException(status_code=404, detail="snapshot not found")
    if source.edition != "FC27" or source.schema_version != 2 or source.taxonomy_verified:
        raise HTTPException(status_code=409, detail="snapshot is not reviewable")
    ruleset = repository.active_ruleset(session, "FC27")
    if ruleset is None:
        raise HTTPException(status_code=409, detail="no active FC27 ruleset")
    items = json.loads(source.items_json)
    item_ids = {str(item["id"]) for item in items}
    if set(body.assignments) != item_ids:
        raise HTTPException(status_code=400, detail="assignments must cover every snapshot item exactly")
    allowed = {
        (row.rating, row.scoring_category)
        for row in session.execute(
            select(ScoringEntry).where(ScoringEntry.ruleset_id == ruleset.id)
        ).scalars()
    }
    derived_items = []
    for item in items:
        category = body.assignments[str(item["id"])].strip().upper()
        if (int(item["rating"]), category) not in allowed:
            raise HTTPException(status_code=400, detail="taxonomy category is not scorable")
        derived_items.append({**item, "scoring_category": category})
    digest = hashlib.sha256(
        json.dumps(
            {"source": source.id, "ruleset": ruleset.id, "items": derived_items},
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    derived = repository.save_snapshot(
        session,
        account_id,
        snapshot_hash=digest,
        items=derived_items,
        player_count=len(derived_items),
        edition="FC27",
        schema_version=2,
        taxonomy_verified=True,
    )
    repository.record_audit(
        session,
        admin_id,
        "taxonomy_verified",
        derived.id,
        f"source={source.id}; reason={body.reason.strip()}",
    )
    return {"snapshot_id": derived.id, "source_snapshot_id": source.id, "snapshot_hash": digest}
