from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    role: Mapped[str] = mapped_column(String(32), default="SUBSCRIBER")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(128), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ExternalIdentity(Base):
    __tablename__ = "external_identities"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64))
    external_sub: Mapped[str] = mapped_column(String(255))
    __table_args__ = (UniqueConstraint("provider", "external_sub", name="uq_external_identity"),)


class DeviceSession(Base):
    __tablename__ = "device_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    session_nonce_hash: Mapped[str] = mapped_column("session_nonce", String(64), unique=True, index=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    refresh_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    refresh_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def session_nonce(self) -> str:
        return getattr(self, "_issued_session_nonce", self.session_nonce_hash)

    @session_nonce.setter
    def session_nonce(self, value: str) -> None:
        self._issued_session_nonce = value


class Pairing(Base):
    __tablename__ = "pairings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code_hash: Mapped[str] = mapped_column("code", String(64), unique=True, index=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"), nullable=True, index=True)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    @property
    def code(self) -> str:
        return getattr(self, "_issued_code", self.code_hash)

    @code.setter
    def code(self, value: str) -> None:
        self._issued_code = value


class Entitlement(Base):
    __tablename__ = "entitlements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    plan: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(32), default="ACTIVE")
    until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    provider_event_created: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    detail: Mapped[str | None] = mapped_column(Text)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class ClubSnapshot(Base):
    __tablename__ = "club_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    snapshot_hash: Mapped[str] = mapped_column(String(64), index=True)
    player_count: Mapped[int] = mapped_column(Integer, default=0)
    edition: Mapped[str] = mapped_column(String(16), default="FC26")
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    taxonomy_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Immutable, server-side inventory captured at snapshot time. Solvers MUST
    # read items only from here; request payloads never supply authoritative items.
    items_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class GuardianPolicyRow(Base):
    __tablename__ = "guardian_policies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    version: Mapped[str] = mapped_column(String(32))
    policy_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    __table_args__ = (UniqueConstraint("account_id", name="uq_guardian_policy_account"),)


class Solution(Base):
    __tablename__ = "solutions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    challenge_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    format: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    decision_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    snapshot_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Provenance: the owned immutable snapshot + exact ACTIVE ruleset used.
    snapshot_id: Mapped[str | None] = mapped_column(ForeignKey("club_snapshots.id"), nullable=True)
    ruleset_id: Mapped[str | None] = mapped_column(ForeignKey("scoring_rulesets.id"), nullable=True)
    edition: Mapped[str] = mapped_column(String(16), default="FC26")
    ruleset_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    items: Mapped[list[SolutionItem]] = relationship(back_populates="solution", cascade="all, delete-orphan")


class SolutionItem(Base):
    __tablename__ = "solution_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    solution_id: Mapped[str] = mapped_column(ForeignKey("solutions.id"), index=True)
    item_id: Mapped[str] = mapped_column(String(64))
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    solution: Mapped[Solution] = relationship(back_populates="items")
    __table_args__ = (UniqueConstraint("solution_id", "item_id", name="uq_solution_item"),)


class ScoringRulesetRow(Base):
    __tablename__ = "scoring_rulesets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    edition: Mapped[str] = mapped_column(String(16))
    ruleset_version: Mapped[str] = mapped_column(String(64))
    taxonomy_version: Mapped[int] = mapped_column(Integer, default=1)
    weights_json: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (
        UniqueConstraint("edition", "ruleset_version", name="uq_scoring_ruleset"),
        Index(
            "uq_active_scoring_ruleset_edition",
            "edition",
            unique=True,
            postgresql_where=active.is_(True),
            sqlite_where=active.is_(True),
        ),
    )


class ScoringEntry(Base):
    __tablename__ = "scoring_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ruleset_id: Mapped[str] = mapped_column(ForeignKey("scoring_rulesets.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    scoring_category: Mapped[str] = mapped_column(String(80))
    points: Mapped[int] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint(
            "ruleset_id", "rating", "scoring_category", name="uq_scoring_entry_exact"
        ),
        CheckConstraint("rating >= 1 AND rating <= 99", name="ck_scoring_entry_rating"),
        CheckConstraint("points > 0", name="ck_scoring_entry_points"),
    )


class ConsumedItem(Base):
    __tablename__ = "consumed_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    item_id: Mapped[str] = mapped_column(String(64))
    solution_id: Mapped[str] = mapped_column(ForeignKey("solutions.id"), index=True)
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    __table_args__ = (UniqueConstraint("account_id", "item_id", name="uq_consumed_item"),)


class PrivacyPreference(Base):
    __tablename__ = "privacy_preferences"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    prefs_json: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
    __table_args__ = (UniqueConstraint("account_id", name="uq_privacy_account"),)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(36), index=True)
    key: Mapped[str] = mapped_column(String(128), index=True)
    value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __table_args__ = (UniqueConstraint("account_id", "key", name="uq_idempotency_account_key"),)


class AuthTransaction(Base):
    __tablename__ = "auth_transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    code_challenge: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StripeSubscription(Base):
    __tablename__ = "stripe_subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    customer_id: Mapped[str] = mapped_column(String(128), unique=True)
    subscription_id: Mapped[str] = mapped_column(String(128), unique=True)
    price_id: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32))
    last_event_created: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


@event.listens_for(ClubSnapshot, "before_update")
def _reject_snapshot_update(_mapper, _connection, _target) -> None:
    """Snapshots are append-only; account deletion uses bulk DELETE separately."""
    raise ValueError("club snapshots are immutable")
