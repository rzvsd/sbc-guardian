from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from .persistence import repository
from .persistence.engine import make_engine
from .persistence.models import Account, AuditEvent, Entitlement

LEGACY_IMPORTABLE = {"accounts", "roles", "entitlements", "audit", "identities"}
LEGACY_EXCLUDED = {
    "EA sessions/cookies",
    "pairing codes",
    "device sessions",
    "refresh tokens",
    "browser sessions",
    "Google Play tokens",
    "RTDN",
    "billing queues",
    "club snapshots",
    "Guardian policies",
    "solutions",
    "submission ledger",
    "OCR corrections",
    "operational events",
    "old scoring registry",
    "site/",
}


def _legacy_grace_days() -> int:
    return int(os.environ.get("LEGACY_MIGRATION_GRACE", "7"))


class LegacySource:
    def __init__(self, dsn: str) -> None:
        self.conn = sqlite3.connect(dsn)
        self.conn.row_factory = sqlite3.Row

    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        mapping = {
            "accounts": "accounts",
            "roles": "account_roles",
            "entitlements": "entitlements",
            "audit": "audit_events",
            "identities": "auth0_identities",
        }
        for key, table in mapping.items():
            try:
                out[key] = self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            except sqlite3.OperationalError:
                out[key] = 0
        return out

    def accounts(self):
        return self.conn.execute("SELECT id, email, created_at FROM accounts").fetchall()

    def roles(self):
        return self.conn.execute("SELECT account_id, role FROM account_roles").fetchall()

    def entitlements(self):
        return self.conn.execute(
            "SELECT account_id, state, plan, until FROM entitlements"
        ).fetchall()

    def audit(self):
        return self.conn.execute(
            "SELECT account_id, action, target, detail, created_at FROM audit_events"
        ).fetchall()

    def identities(self):
        try:
            return self.conn.execute(
                "SELECT account_id, subject, email_verified FROM auth0_identities"
            ).fetchall()
        except sqlite3.OperationalError:
            return []

    def close(self) -> None:
        self.conn.close()


def _map_entitlement(state: str | None, until: str | None):
    state = state or "EXPIRED"
    if state in ("ACTIVE", "GRACE") and not until:
        until_dt = datetime.now(UTC) + timedelta(days=_legacy_grace_days())
        return state, until_dt
    if until:
        return state, datetime.fromisoformat(until) if isinstance(until, str) else until
    return state, None


def run(
    *,
    source_dsn: str,
    target_dsn: str,
    migration_batch_id: str,
    backup_path: str,
    confirmation_phrase: str,
    dry_run: bool,
    verify: bool,
) -> dict[str, int]:
    src = LegacySource(source_dsn)
    try:
        counts = src.counts()
        if dry_run:
            return {"mode": "dry-run" if dry_run else "verify", **counts}
        if verify:
            if not target_dsn:
                raise ValueError("target required for --verify")
            engine = make_engine(target_dsn)
            SessionLocal = sessionmaker(bind=engine, future=True)
            with SessionLocal() as session:
                target_counts = {
                    "accounts": session.scalar(select(func.count()).select_from(Account)) or 0,
                    "entitlements": session.scalar(select(func.count()).select_from(Entitlement)) or 0,
                    "audit": session.scalar(select(func.count()).select_from(AuditEvent)) or 0,
                }
            engine.dispose()
            return {
                "mode": "verify",
                **counts,
                "verified": all(target_counts[key] >= counts[key] for key in target_counts),
            }
        if confirmation_phrase != "MIGRATE LEGACY":
            raise PermissionError("confirmation phrase required for --apply")
        if not target_dsn or not migration_batch_id or not backup_path:
            raise ValueError("source, target, batch id, backup path required for --apply")
        if not Path(backup_path).is_file():
            raise ValueError("verified backup file required for --apply")

        engine = make_engine(target_dsn)
        SessionLocal = sessionmaker(bind=engine, future=True)
        principal_email = os.environ.get("SBC_PRINCIPAL_ADMIN_EMAIL", "")

        with SessionLocal() as session:
            if session.query(AuditEvent).filter(
                AuditEvent.action == "legacy_migration_batch",
                AuditEvent.detail == migration_batch_id,
            ).first():
                raise ValueError("migration batch already applied")
            role_by_account = {r["account_id"]: r["role"] for r in src.roles()}
            imported = {"accounts": 0, "roles": 0, "entitlements": 0, "audit": 0, "identities": 0}
            for row in src.accounts():
                email = row["email"]
                role = role_by_account.get(row["id"], "SUBSCRIBER")
                if role not in {"SUBSCRIBER", "ADMIN", "PRINCIPAL_ADMIN"}:
                    role = "SUBSCRIBER"
                if email == principal_email:
                    role = "PRINCIPAL_ADMIN"
                if repository.get_account_by_email(session, email) is None:
                    repository.create_account(session, email, role)
                imported["accounts"] += 1
                imported["roles"] += 1
            for row in src.identities():
                if row["email_verified"] != 1:
                    continue
                acct = _account_by_legacy_id(session, row["account_id"], src)
                if acct is not None and not repository.account_has_provider_identity(
                    session, acct.id, "auth0"
                ):
                    repository.link_external_identity(
                        session, acct.id, "auth0", row["subject"]
                    )
                    imported["identities"] += 1
            for row in src.entitlements():
                acct = _account_by_legacy_id(session, row["account_id"], src)
                if acct is None:
                    continue
                state, until = _map_entitlement(row["state"], row["until"])
                repository.set_entitlement(
                    session, acct.id, plan=row["plan"] or "SBC_GUARDIAN_MONTHLY",
                    state=state, until=until, reason="legacy_migration:" + migration_batch_id,
                )
                imported["entitlements"] += 1
            for row in src.audit():
                acct = _account_by_legacy_id(session, row["account_id"], src)
                aid = acct.id if acct else row["account_id"]
                repository.record_audit(
                    session, aid, row["action"], row["target"],
                    f"legacy event imported | batch:{migration_batch_id}",
                )
                imported["audit"] += 1
            repository.record_audit(
                session, None, "legacy_migration_batch", None, migration_batch_id
            )
            session.commit()
        engine.dispose()
        return {"mode": "apply", **imported}
    finally:
        src.close()


def _account_by_legacy_id(session, legacy_id: str, src: LegacySource):
    row = src.conn.execute("SELECT email FROM accounts WHERE id = ?", (legacy_id,)).fetchone()
    if row is None:
        return None
    return repository.get_account_by_email(session, row["email"])


def main() -> None:
    parser = argparse.ArgumentParser(prog="migrate_legacy")
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", default="")
    parser.add_argument("--migration-batch-id", default="")
    parser.add_argument("--backup-path", default="")
    parser.add_argument("--confirmation-phrase", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    result = run(
        source_dsn=args.source,
        target_dsn=args.target,
        migration_batch_id=args.migration_batch_id,
        backup_path=args.backup_path,
        confirmation_phrase=args.confirmation_phrase,
        dry_run=args.dry_run,
        verify=args.verify,
    )
    print(result)


if __name__ == "__main__":
    main()
