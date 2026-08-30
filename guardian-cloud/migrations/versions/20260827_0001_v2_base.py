"""v2_base

New PostgreSQL root for Guardian Cloud v2 (does not continue the legacy
0013-0017 chain). Creates the v2 tables with UUID PKs, UTC timestamps,
immutable snapshots, and append-only audit.

Revision ID: 20260827_0001_v2_base
Revises:
Create Date: 2026-08-27 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260827_0001_v2_base"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("stripe_customer_id", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("stripe_customer_id"),
    )
    op.create_table(
        "external_identities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("external_sub", sa.String(255), nullable=False),
        sa.UniqueConstraint("provider", "external_sub", name="uq_external_identity"),
    )
    op.create_index("ix_external_identities_account_id", "external_identities", ["account_id"])
    op.create_table(
        "device_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("session_nonce", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=True),
        sa.Column("refresh_token_hash", sa.String(64), nullable=True),
        sa.Column("revoked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_rotated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_device_sessions_account_id", "device_sessions", ["account_id"])
    op.create_index("ix_device_sessions_session_nonce", "device_sessions", ["session_nonce"], unique=True)
    op.create_index("ix_device_sessions_token_hash", "device_sessions", ["token_hash"])
    op.create_table(
        "pairings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("claimed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_pairings_account_id", "pairings", ["account_id"])
    op.create_index("ix_pairings_code", "pairings", ["code"], unique=True)
    op.create_table(
        "entitlements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("plan", sa.String(64), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider_event_created", sa.Integer(), nullable=True),
    )
    op.create_index("ix_entitlements_account_id", "entitlements", ["account_id"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_events_account_id", "audit_events", ["account_id"])
    op.create_table(
        "club_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("snapshot_hash", sa.String(64), nullable=False),
        sa.Column("player_count", sa.Integer(), nullable=False),
        sa.Column("edition", sa.String(16), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("taxonomy_verified", sa.Boolean(), nullable=False),
        sa.Column("items_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_club_snapshots_account_id", "club_snapshots", ["account_id"])
    op.create_index("ix_club_snapshots_snapshot_hash", "club_snapshots", ["snapshot_hash"])
    op.create_table(
        "guardian_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("policy_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("account_id", name="uq_guardian_policy_account"),
    )
    op.create_index("ix_guardian_policies_account_id", "guardian_policies", ["account_id"])
    op.create_table(
        "scoring_rulesets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("edition", sa.String(16), nullable=False),
        sa.Column("ruleset_version", sa.String(64), nullable=False),
        sa.Column("taxonomy_version", sa.Integer(), nullable=False),
        sa.Column("weights_json", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("edition", "ruleset_version", name="uq_scoring_ruleset"),
    )
    op.create_index(
        "uq_active_scoring_ruleset_edition",
        "scoring_rulesets",
        ["edition"],
        unique=True,
        postgresql_where=sa.text("active IS TRUE"),
        sqlite_where=sa.text("active = 1"),
    )
    op.create_table(
        "scoring_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("ruleset_id", sa.String(36), sa.ForeignKey("scoring_rulesets.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("scoring_category", sa.String(80), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.CheckConstraint("rating >= 1 AND rating <= 99", name="ck_scoring_entry_rating"),
        sa.CheckConstraint("points > 0", name="ck_scoring_entry_points"),
        sa.UniqueConstraint("ruleset_id", "rating", "scoring_category", name="uq_scoring_entry_exact"),
    )
    op.create_index("ix_scoring_entries_ruleset_id", "scoring_entries", ["ruleset_id"])
    op.create_table(
        "solutions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("challenge_id", sa.String(64), nullable=True),
        sa.Column("format", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("decision_id", sa.String(64), nullable=True),
        sa.Column("snapshot_hash", sa.String(64), nullable=True),
        sa.Column("snapshot_id", sa.String(36), sa.ForeignKey("club_snapshots.id"), nullable=True),
        sa.Column("ruleset_id", sa.String(36), sa.ForeignKey("scoring_rulesets.id"), nullable=True),
        sa.Column("edition", sa.String(16), nullable=False),
        sa.Column("ruleset_version", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_solutions_account_id", "solutions", ["account_id"])
    op.create_table(
        "solution_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("solution_id", sa.String(36), sa.ForeignKey("solutions.id"), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(32), nullable=True),
        sa.UniqueConstraint("solution_id", "item_id", name="uq_solution_item"),
    )
    op.create_index("ix_solution_items_solution_id", "solution_items", ["solution_id"])
    op.create_table(
        "consumed_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("item_id", sa.String(64), nullable=False),
        sa.Column("solution_id", sa.String(36), sa.ForeignKey("solutions.id"), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("account_id", "item_id", name="uq_consumed_item"),
    )
    op.create_index("ix_consumed_items_account_id", "consumed_items", ["account_id"])
    op.create_index("ix_consumed_items_solution_id", "consumed_items", ["solution_id"])
    op.create_table(
        "privacy_preferences",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("prefs_json", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("account_id", name="uq_privacy_account"),
    )
    op.create_index("ix_privacy_preferences_account_id", "privacy_preferences", ["account_id"])
    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), nullable=False),
        sa.Column("key", sa.String(128), nullable=False),
        sa.Column("value", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=True),
        sa.UniqueConstraint("account_id", "key", name="uq_idempotency_account_key"),
    )
    op.create_index("ix_idempotency_records_account_id", "idempotency_records", ["account_id"])
    op.create_index("ix_idempotency_records_key", "idempotency_records", ["key"])
    op.create_table(
        "auth_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("state_hash", sa.String(64), nullable=False),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_transactions_state_hash", "auth_transactions", ["state_hash"], unique=True)
    op.create_table(
        "stripe_subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("customer_id", sa.String(128), nullable=False, unique=True),
        sa.Column("subscription_id", sa.String(128), nullable=False, unique=True),
        sa.Column("price_id", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("last_event_created", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stripe_subscriptions_account_id", "stripe_subscriptions", ["account_id"])


def downgrade() -> None:
    for table_name in (
        "stripe_subscriptions",
        "auth_transactions",
        "idempotency_records",
        "privacy_preferences",
        "consumed_items",
        "solution_items",
        "solutions",
        "scoring_entries",
        "scoring_rulesets",
        "guardian_policies",
        "club_snapshots",
        "audit_events",
        "entitlements",
        "pairings",
        "device_sessions",
        "external_identities",
        "accounts",
    ):
        op.drop_table(table_name)
