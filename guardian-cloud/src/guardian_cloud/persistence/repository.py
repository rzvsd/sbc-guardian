from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import (
    Account,
    AuditEvent,
    AuthTransaction,
    ClubSnapshot,
    ConsumedItem,
    DeviceSession,
    Entitlement,
    ExternalIdentity,
    GuardianPolicyRow,
    IdempotencyRecord,
    Pairing,
    PrivacyPreference,
    ScoringRulesetRow,
    Solution,
    SolutionItem,
    StripeSubscription,
)


def _new_id() -> str:
    return str(uuid.uuid4())


class OwnershipError(Exception):
    """Raised when a resource is missing or not owned by the caller.

    Mapped to HTTP 404 by the app so foreign/missing resources are
    indistinguishable (fail-closed, no enumeration)."""


class ConflictError(Exception):
    """Raised on an atomic-conflict condition (e.g. overlapping consumption)."""


def require_ownership(row: Any | None, account_id: str) -> Any:
    if row is None or row.account_id != account_id:
        raise OwnershipError("ownership check failed")
    return row


def lock_account(session: Session, account_id: str) -> Account:
    """Serialize solve/confirm mutations for one account on PostgreSQL."""
    account = session.execute(
        select(Account).where(Account.id == account_id).with_for_update()
    ).scalar_one_or_none()
    if account is None:
        raise OwnershipError("account not found")
    return account


def save_snapshot(
    session: Session,
    account_id: str,
    *,
    snapshot_hash: str,
    items: list[dict[str, Any]] | None = None,
    player_count: int = 0,
    edition: str = "FC26",
    schema_version: int = 1,
    taxonomy_verified: bool = False,
) -> ClubSnapshot:
    snap = ClubSnapshot(
        id=_new_id(),
        account_id=account_id,
        snapshot_hash=snapshot_hash,
        player_count=player_count,
        edition=edition,
        schema_version=schema_version,
        taxonomy_verified=taxonomy_verified,
        items_json=json.dumps(items or [], sort_keys=True),
    )
    session.add(snap)
    session.flush()
    return snap


def latest_snapshot(
    session: Session,
    account_id: str,
    *,
    edition: str | None = None,
    taxonomy_verified: bool | None = None,
) -> ClubSnapshot | None:
    stmt = (
        select(ClubSnapshot)
        .where(ClubSnapshot.account_id == account_id)
        .order_by(ClubSnapshot.created_at.desc(), ClubSnapshot.id.desc())
        .limit(1)
    )
    if edition is not None:
        stmt = stmt.where(ClubSnapshot.edition == edition)
    if taxonomy_verified is not None:
        stmt = stmt.where(ClubSnapshot.taxonomy_verified == taxonomy_verified)
    return session.execute(stmt).scalar_one_or_none()


def get_snapshot(session: Session, account_id: str, snapshot_id: str) -> ClubSnapshot:
    snap = session.get(ClubSnapshot, snapshot_id)
    return require_ownership(snap, account_id)


def get_snapshot_items(session: Session, account_id: str, snapshot_id: str) -> list[dict[str, Any]]:
    """Load the immutable, server-side inventory for an owned snapshot.

    Missing or foreign snapshots raise OwnershipError (mapped to 404)."""
    snap = get_snapshot(session, account_id, snapshot_id)
    return json.loads(snap.items_json)


def get_policy(session: Session, account_id: str) -> GuardianPolicyRow | None:
    stmt = (
        select(GuardianPolicyRow)
        .where(GuardianPolicyRow.account_id == account_id)
        .order_by(GuardianPolicyRow.updated_at.desc())
        .limit(1)
    )
    return session.execute(stmt).scalar_one_or_none()


def put_policy(session: Session, account_id: str, policy: dict[str, Any]) -> GuardianPolicyRow:
    row = get_policy(session, account_id)
    data = json.dumps(policy, sort_keys=True)
    if row is None:
        row = GuardianPolicyRow(id=_new_id(), account_id=account_id, version="1", policy_json=data)
        session.add(row)
    else:
        row.policy_json = data
    session.flush()
    return row


def create_solution(
    session: Session,
    account_id: str,
    *,
    format: str,
    challenge_id: str | None,
    decision_id: str | None,
    snapshot_hash: str | None,
    snapshot_id: str | None = None,
    ruleset_id: str | None = None,
    edition: str = "FC26",
    ruleset_version: str | None = None,
    item_ids: list[str],
) -> Solution:
    lock_account(session, account_id)
    if not item_ids or len(set(item_ids)) != len(item_ids):
        raise ValueError("solution items must be non-empty and unique")
    if snapshot_id is None:
        raise ValueError("solution snapshot is required")
    snapshot = get_snapshot(session, account_id, snapshot_id)
    if snapshot.edition != edition:
        raise ValueError("solution edition does not match snapshot")
    if format == "TRADITIONAL" and (edition != "FC26" or ruleset_id is not None):
        raise ValueError("invalid Traditional solution provenance")
    if format == "STREAMLINED" and (
        edition != "FC27" or ruleset_id is None or ruleset_version is None
    ):
        raise ValueError("invalid Streamlined solution provenance")
    if format not in {"TRADITIONAL", "STREAMLINED"}:
        raise ValueError("unsupported solution format")
    snapshot_item_ids = {str(item.get("id")) for item in json.loads(snapshot.items_json)}
    if not set(item_ids).issubset(snapshot_item_ids):
        raise ValueError("solution contains item outside snapshot")
    if set(item_ids) & confirmed_item_ids(session, account_id):
        raise ConflictError("solution contains consumed item")
    if format == "STREAMLINED":
        active = active_ruleset(session, "FC27")
        if active is None or active.id != ruleset_id or active.ruleset_version != ruleset_version:
            raise ConflictError("solution ruleset is no longer active")
    sol = Solution(
        id=_new_id(),
        account_id=account_id,
        challenge_id=challenge_id,
        format=format,
        decision_id=decision_id,
        snapshot_hash=snapshot_hash,
        snapshot_id=snapshot_id,
        ruleset_id=ruleset_id,
        edition=edition,
        ruleset_version=ruleset_version,
        status="PENDING",
    )
    for item_id in item_ids:
        sol.items.append(type(sol).items.property.mapper.class_(id=_new_id(), item_id=item_id))
    session.add(sol)
    session.flush()
    return sol


def list_solutions(session: Session, account_id: str, limit: int = 10) -> list[Solution]:
    stmt = (
        select(Solution)
        .where(Solution.account_id == account_id)
        .order_by(Solution.created_at.desc(), Solution.id.desc())
        .limit(limit)
    )
    return list(session.execute(stmt).scalars())


def get_solution(session: Session, account_id: str, solution_id: str) -> Solution:
    """Return an owned solution or raise the same non-enumerating ownership error."""
    return require_ownership(session.get(Solution, solution_id), account_id)


def confirm_solution(session: Session, account_id: str, solution_id: str, decision_id: str) -> Solution:
    lock_account(session, account_id)
    sol = session.execute(
        select(Solution).where(Solution.id == solution_id).with_for_update()
    ).scalar_one_or_none()
    require_ownership(sol, account_id)
    if sol.decision_id != decision_id:
        raise ValueError("decision mismatch")
    # Idempotent: a previously confirmed solution stays confirmed.
    if sol.status == "CONFIRMED":
        return sol
    if sol.status != "PENDING":
        raise ConflictError("solution is not confirmable")
    if sol.snapshot_id is None:
        raise ConflictError("solution snapshot provenance missing")
    snapshot = get_snapshot(session, account_id, sol.snapshot_id)
    if snapshot.snapshot_hash != sol.snapshot_hash or snapshot.edition != sol.edition:
        raise ConflictError("solution snapshot provenance changed")
    snapshot_item_ids = {str(item.get("id")) for item in json.loads(snapshot.items_json)}
    # Fail closed on overlapping consumption across confirmed solutions.
    selected = [it.item_id for it in sol.items]
    if not selected or len(selected) != len(set(selected)) or not set(selected).issubset(snapshot_item_ids):
        raise ConflictError("solution items do not match snapshot")
    if sol.format == "STREAMLINED":
        active = active_ruleset(session, "FC27")
        if (
            active is None
            or active.id != sol.ruleset_id
            or active.ruleset_version != sol.ruleset_version
        ):
            raise ConflictError("solution ruleset is no longer active")
    if has_confirmed_overlap(session, account_id, selected, exclude_solution_id=sol.id):
        raise ConflictError("overlapping confirmed items")
    try:
        with session.begin_nested():
            for item_id in selected:
                session.add(
                    ConsumedItem(
                        id=_new_id(),
                        account_id=account_id,
                        item_id=item_id,
                        solution_id=sol.id,
                    )
                )
            session.flush()
    except IntegrityError as exc:
        raise ConflictError("overlapping confirmed items") from exc
    sol.status = "CONFIRMED"
    session.flush()
    return sol


def dismiss_solution(session: Session, account_id: str, solution_id: str) -> Solution:
    lock_account(session, account_id)
    sol = session.get(Solution, solution_id)
    require_ownership(sol, account_id)
    if sol.status == "CONFIRMED":
        raise ConflictError("confirmed solution cannot be dismissed")
    if sol.status == "DISMISSED":
        return sol
    if sol.status != "PENDING":
        raise ConflictError("solution is not dismissible")
    sol.status = "DISMISSED"
    session.flush()
    return sol


def has_confirmed_overlap(
    session: Session,
    account_id: str,
    item_ids: list[str],
    *,
    exclude_solution_id: str | None = None,
) -> bool:
    if not item_ids:
        return False
    stmt = (
        select(SolutionItem)
        .join(Solution, SolutionItem.solution_id == Solution.id)
        .where(
            Solution.account_id == account_id,
            Solution.status == "CONFIRMED",
            SolutionItem.item_id.in_(item_ids),
        )
    )
    if exclude_solution_id is not None:
        stmt = stmt.where(Solution.id != exclude_solution_id)
    return session.execute(stmt).first() is not None


def get_ruleset(session: Session, edition: str, ruleset_version: str) -> ScoringRulesetRow | None:
    stmt = select(ScoringRulesetRow).where(
        ScoringRulesetRow.edition == edition,
        ScoringRulesetRow.ruleset_version == ruleset_version,
    )
    return session.execute(stmt).scalar_one_or_none()


def active_ruleset(session: Session, edition: str) -> ScoringRulesetRow | None:
    stmt = select(ScoringRulesetRow).where(
        ScoringRulesetRow.edition == edition, ScoringRulesetRow.active.is_(True)
    )
    return session.execute(stmt).scalar_one_or_none()


def confirmed_item_ids(session: Session, account_id: str) -> set[str]:
    """Item IDs already consumed by a CONFIRMED solution for the account."""
    stmt = select(ConsumedItem.item_id).where(ConsumedItem.account_id == account_id)
    return {row[0] for row in session.execute(stmt).all()}


def get_ruleset_entry_points(
    session: Session, ruleset_id: str, rating: int, scoring_category: str
) -> int | None:
    """Exact server-side points for rating + canonical category. None => unscorable."""
    from .models import ScoringEntry

    row = session.execute(
        select(ScoringEntry).where(
            ScoringEntry.ruleset_id == ruleset_id,
            ScoringEntry.rating == rating,
            ScoringEntry.scoring_category == scoring_category,
        )
    ).scalar_one_or_none()
    return None if row is None else int(row.points)


def create_ruleset(
    session: Session,
    edition: str,
    ruleset_version: str,
    weights: dict[str, Any],
    *,
    active: bool = False,
    taxonomy_version: int = 2,
) -> ScoringRulesetRow:
    row = ScoringRulesetRow(
        id=_new_id(),
        edition=edition,
        ruleset_version=ruleset_version,
        taxonomy_version=taxonomy_version,
        weights_json=json.dumps(weights, sort_keys=True),
        active=active,
    )
    session.add(row)
    session.flush()
    return row


def add_ruleset_entry(
    session: Session,
    ruleset_id: str,
    rating: int,
    scoring_category: str,
    points: int,
) -> None:
    from .models import ScoringEntry

    category = scoring_category.strip().upper()
    if not 1 <= rating <= 99:
        raise ValueError("rating must be between 1 and 99")
    if points <= 0:
        raise ValueError("points must be positive")
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_:-]{0,79}", category):
        raise ValueError("invalid scoring category")
    session.add(
        ScoringEntry(
            id=_new_id(),
            ruleset_id=ruleset_id,
            rating=rating,
            scoring_category=category,
            points=points,
        )
    )
    session.flush()


def set_active_ruleset(session: Session, ruleset_id: str) -> ScoringRulesetRow:
    ruleset = session.get(ScoringRulesetRow, ruleset_id)
    if ruleset is None:
        raise ValueError("ruleset not found")
    for other in session.execute(
        select(ScoringRulesetRow).where(ScoringRulesetRow.edition == ruleset.edition)
    ).scalars():
        other.active = False
    session.flush()
    ruleset.active = True
    session.flush()
    return ruleset


def get_privacy(session: Session, account_id: str) -> PrivacyPreference | None:
    stmt = (
        select(PrivacyPreference)
        .where(PrivacyPreference.account_id == account_id)
        .order_by(PrivacyPreference.updated_at.desc())
        .limit(1)
    )
    return session.execute(stmt).scalar_one_or_none()


def put_privacy(session: Session, account_id: str, prefs: dict[str, Any]) -> PrivacyPreference:
    row = get_privacy(session, account_id)
    data = json.dumps(prefs, sort_keys=True)
    if row is None:
        row = PrivacyPreference(id=_new_id(), account_id=account_id, prefs_json=data)
        session.add(row)
    else:
        row.prefs_json = data
    session.flush()
    return row


def export_account(session: Session, account_id: str) -> dict[str, Any]:
    return {
        "account_id": account_id,
        "snapshots": list(
            session.execute(
                select(ClubSnapshot.id).where(ClubSnapshot.account_id == account_id)
            ).scalars()
        ),
        "solutions": list(
            session.execute(
                select(Solution.id).where(Solution.account_id == account_id)
            ).scalars()
        ),
        "privacy": (get_privacy(session, account_id).prefs_json if get_privacy(session, account_id) else None),
    }


def delete_account(session: Session, account_id: str) -> None:
    solution_ids = select(Solution.id).where(Solution.account_id == account_id)
    session.execute(delete(ConsumedItem).where(ConsumedItem.account_id == account_id))
    session.execute(delete(SolutionItem).where(SolutionItem.solution_id.in_(solution_ids)))
    for cls in (
        Solution,
        ClubSnapshot,
        GuardianPolicyRow,
        PrivacyPreference,
        IdempotencyRecord,
        DeviceSession,
        ExternalIdentity,
        Entitlement,
        Pairing,
        StripeSubscription,
    ):
        session.execute(delete(cls).where(cls.account_id == account_id))
    session.execute(
        update(AuditEvent).where(AuditEvent.account_id == account_id).values(account_id=None)
    )
    acct = session.get(Account, account_id)
    if acct is not None:
        session.delete(acct)


def append_audit(session: Session, account_id: str | None, action: str, detail: str | None) -> AuditEvent:
    ev = AuditEvent(id=_new_id(), account_id=account_id, action=action, detail=detail)
    session.add(ev)
    session.flush()
    return ev


def record_audit(session: Session, account_id: str | None, action: str, target: str | None, detail: str | None) -> AuditEvent:
    """Audit with an explicit target, folded into the detail text (no separate column)."""
    full = f"target={target} | {detail}" if target else (detail or "")
    return append_audit(session, account_id, action, full)


def record_idempotency(
    session: Session,
    account_id: str,
    key: str,
    value: str | None = None,
    *,
    request_hash: str | None = None,
) -> tuple[bool, str | None]:
    """Return (is_new, stored_value). If key existed, is_new=False and returns stored value.

    A non-None value updates an existing record so callers can write the result back."""
    existing = session.execute(
        select(IdempotencyRecord).where(
            IdempotencyRecord.account_id == account_id, IdempotencyRecord.key == key
        )
    ).scalar_one_or_none()
    if existing is not None:
        if request_hash and existing.request_hash and request_hash != existing.request_hash:
            raise ConflictError("idempotency key reused with different request")
        if value is not None:
            existing.value = value
            session.flush()
        return False, existing.value
    # The unique constraint is the authority when two requests race. A
    # savepoint lets us recover from the losing INSERT without poisoning the
    # surrounding request transaction.
    try:
        with session.begin_nested():
            record = IdempotencyRecord(
                id=_new_id(),
                account_id=account_id,
                key=key,
                value=value,
                request_hash=request_hash,
            )
            session.add(record)
            session.flush()
    except IntegrityError as exc:
        existing = session.execute(
            select(IdempotencyRecord).where(
                IdempotencyRecord.account_id == account_id, IdempotencyRecord.key == key
            )
        ).scalar_one_or_none()
        if existing is None:
            raise
        if request_hash and existing.request_hash and request_hash != existing.request_hash:
            raise ConflictError("idempotency key reused with different request") from exc
        return False, existing.value
    return True, value


# ---- Accounts / roles ----

def create_account(session: Session, email: str | None, role: str = "SUBSCRIBER") -> Account:
    normalized_email = email.strip().casefold() if email is not None else None
    acct = Account(id=_new_id(), role=role, email=normalized_email)
    session.add(acct)
    session.flush()
    return acct


def get_account(session: Session, account_id: str) -> Account | None:
    return session.get(Account, account_id)


def get_account_by_email(session: Session, email: str) -> Account | None:
    normalized_email = email.strip().casefold()
    return session.execute(
        select(Account).where(Account.email == normalized_email)
    ).scalar_one_or_none()


def get_external_identity(session: Session, provider: str, subject: str) -> ExternalIdentity | None:
    return session.execute(
        select(ExternalIdentity).where(
            ExternalIdentity.provider == provider, ExternalIdentity.external_sub == subject
        )
    ).scalar_one_or_none()


def account_has_provider_identity(session: Session, account_id: str, provider: str) -> bool:
    return session.execute(
        select(ExternalIdentity.id).where(
            ExternalIdentity.account_id == account_id, ExternalIdentity.provider == provider
        )
    ).first() is not None


def link_external_identity(
    session: Session, account_id: str, provider: str, subject: str
) -> ExternalIdentity:
    row = ExternalIdentity(
        id=_new_id(), account_id=account_id, provider=provider, external_sub=subject
    )
    session.add(row)
    session.flush()
    return row


def get_latest_entitlement(session: Session, account_id: str):

    return session.execute(
        select(Entitlement)
        .where(Entitlement.account_id == account_id)
        .order_by(Entitlement.created_at.desc(), Entitlement.id.desc())
    ).scalars().first()


def set_entitlement(
    session: Session,
    account_id: str,
    *,
    plan: str,
    state: str,
    until: datetime | None,
    reason: str,
    provider_event_created: int | None = None,
) -> Entitlement:
    ent = Entitlement(
        id=_new_id(),
        account_id=account_id,
        plan=plan,
        state=state,
        until=until,
        reason=reason,
        provider_event_created=provider_event_created,
    )
    session.add(ent)
    session.flush()
    return ent


def set_account_role(session: Session, account_id: str, role: str) -> Account:
    if role not in {"ADMIN", "SUBSCRIBER"}:
        raise ValueError("invalid assignable role")
    acct = session.get(Account, account_id)
    if acct is None:
        raise ValueError("account not found")
    if acct.role == "PRINCIPAL_ADMIN":
        raise PermissionError("principal admin is immutable")
    acct.role = role
    session.flush()
    return acct


# ---- Device sessions (rotation / revocation) ----

def create_device_session(
    session: Session,
    account_id: str,
    *,
    session_nonce: str,
    token_hash: str,
    refresh_token_hash: str,
    expires_at,
    refresh_expires_at=None,
) -> DeviceSession:
    nonce_hash = hashlib.sha256(session_nonce.encode()).hexdigest()
    ds = DeviceSession(
        id=_new_id(),
        account_id=account_id,
        session_nonce_hash=nonce_hash,
        token_hash=token_hash,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
        refresh_expires_at=refresh_expires_at,
    )
    ds.session_nonce = session_nonce
    session.add(ds)
    session.flush()
    return ds


def rotate_device_session(
    session: Session,
    session_id: str,
    *,
    session_nonce: str,
    token_hash: str,
    refresh_token_hash: str,
    expires_at,
    refresh_expires_at=None,
) -> DeviceSession:

    old = session.execute(
        select(DeviceSession).where(DeviceSession.id == session_id).with_for_update()
    ).scalar_one_or_none()
    if old is None or old.revoked:
        raise ValueError("device session not found")
    old.revoked = True
    new = DeviceSession(
        id=_new_id(),
        account_id=old.account_id,
        session_nonce_hash=hashlib.sha256(session_nonce.encode()).hexdigest(),
        token_hash=token_hash,
        refresh_token_hash=refresh_token_hash,
        expires_at=expires_at,
        refresh_expires_at=refresh_expires_at,
        last_rotated_at=datetime.now(UTC),
    )
    new.session_nonce = session_nonce
    session.add(new)
    session.flush()
    return new


def revoke_device_session(session: Session, session_id: str) -> None:

    ds = session.get(DeviceSession, session_id)
    if ds is not None:
        ds.revoked = True
        session.flush()


def revoke_all_device_sessions(session: Session, account_id: str) -> None:

    rows = session.execute(
        select(DeviceSession).where(DeviceSession.account_id == account_id)
    ).scalars().all()
    for ds in rows:
        ds.revoked = True
    revoke_pending_pairings(session, account_id)
    session.flush()


def get_valid_session(session: Session, session_nonce: str) -> DeviceSession | None:
    nonce_hash = hashlib.sha256(session_nonce.encode()).hexdigest()
    ds = session.execute(
        select(DeviceSession).where(DeviceSession.session_nonce_hash == nonce_hash)
    ).scalar_one_or_none()
    if ds is None or ds.revoked:
        return None
    exp = ds.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=UTC)
    if exp < datetime.now(UTC):
        return None
    return ds


def get_valid_refresh_session(session: Session, refresh_token: str) -> DeviceSession | None:
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    ds = session.execute(
        select(DeviceSession).where(DeviceSession.refresh_token_hash == token_hash)
    ).scalar_one_or_none()
    if ds is None or ds.revoked or ds.refresh_expires_at is None:
        return None
    expires = ds.refresh_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return ds if expires > datetime.now(UTC) else None


# ---- Pairings ----

def create_pairing(session: Session, code: str, expires_at, account_id: str) -> Pairing:
    pairing = Pairing(
        id=_new_id(),
        code_hash=hashlib.sha256(code.encode()).hexdigest(),
        account_id=account_id,
        expires_at=expires_at,
    )
    pairing.code = code
    session.add(pairing)
    session.flush()
    return pairing


def claim_pairing(session: Session, code: str) -> Pairing:
    pairing = session.execute(
        select(Pairing)
        .where(Pairing.code_hash == hashlib.sha256(code.encode()).hexdigest())
        .with_for_update()
    ).scalar_one_or_none()
    if pairing is None:
        raise ValueError("pairing not found")
    if pairing.claimed:
        raise ValueError("pairing already claimed")
    account = session.get(Account, pairing.account_id) if pairing.account_id else None
    if account is None or account.status != "ACTIVE":
        raise ValueError("pairing owner is inactive")
    expires = pairing.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise ValueError("pairing expired")
    pairing.claimed = True
    session.flush()
    return pairing


def revoke_pending_pairings(session: Session, account_id: str) -> None:
    session.execute(
        update(Pairing)
        .where(Pairing.account_id == account_id, Pairing.claimed.is_(False))
        .values(claimed=True)
    )


def create_auth_transaction(
    session: Session, state: str, code_challenge: str, expires_at: datetime
) -> AuthTransaction:
    row = AuthTransaction(
        id=_new_id(),
        state_hash=hashlib.sha256(state.encode()).hexdigest(),
        code_challenge=code_challenge,
        expires_at=expires_at,
    )
    session.add(row)
    session.flush()
    return row


def consume_auth_transaction(session: Session, state: str) -> AuthTransaction | None:
    row = session.execute(
        select(AuthTransaction)
        .where(AuthTransaction.state_hash == hashlib.sha256(state.encode()).hexdigest())
        .with_for_update()
    ).scalar_one_or_none()
    if row is None or row.used_at is not None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires <= datetime.now(UTC):
        return None
    row.used_at = datetime.now(UTC)
    session.flush()
    return row


def get_stripe_subscription(session: Session, subscription_id: str) -> StripeSubscription | None:
    return session.execute(
        select(StripeSubscription).where(StripeSubscription.subscription_id == subscription_id)
    ).scalar_one_or_none()


def upsert_stripe_subscription(
    session: Session,
    *,
    account_id: str,
    customer_id: str,
    subscription_id: str,
    price_id: str,
    status: str,
    event_created: int,
) -> tuple[StripeSubscription, bool]:
    row = get_stripe_subscription(session, subscription_id)
    if row is not None and event_created <= row.last_event_created:
        return row, False
    account = get_account(session, account_id)
    if account is None:
        raise ValueError("unknown billing account")
    if account.stripe_customer_id not in (None, customer_id):
        raise ConflictError("stripe customer binding mismatch")
    account.stripe_customer_id = customer_id
    if row is None:
        row = StripeSubscription(
            id=_new_id(),
            account_id=account_id,
            customer_id=customer_id,
            subscription_id=subscription_id,
            price_id=price_id,
            status=status,
            last_event_created=event_created,
        )
        session.add(row)
    else:
        if row.account_id != account_id or row.customer_id != customer_id:
            raise ConflictError("stripe subscription binding mismatch")
        row.price_id = price_id
        row.status = status
        row.last_event_created = event_created
        row.updated_at = datetime.now(UTC)
    session.flush()
    return row, True
