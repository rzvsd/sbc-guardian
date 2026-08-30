from __future__ import annotations

import os
import sqlite3
import tempfile

from alembic import command
from alembic.config import Config

from guardian_cloud import migrate_legacy
from guardian_cloud.persistence import repository


def _make_legacy() -> str:
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE accounts (id TEXT, email TEXT, created_at TEXT)")
    conn.execute("CREATE TABLE account_roles (account_id TEXT, role TEXT)")
    conn.execute("CREATE TABLE entitlements (account_id TEXT, state TEXT, plan TEXT, until TEXT)")
    conn.execute(
        "CREATE TABLE audit_events (account_id TEXT, action TEXT, target TEXT, detail TEXT, created_at TEXT)"
    )
    conn.execute("CREATE TABLE auth0_identities (account_id TEXT, subject TEXT, email_verified INTEGER)")
    conn.execute("INSERT INTO accounts VALUES ('u1','legacy@example.com','2024-01-01')")
    conn.execute("INSERT INTO account_roles VALUES ('u1','SUBSCRIBER')")
    conn.execute("INSERT INTO entitlements VALUES ('u1','ACTIVE','SBC_GUARDIAN_MONTHLY',NULL)")
    conn.execute("INSERT INTO audit_events VALUES ('u1','login','u1','ok','2024-01-02')")
    conn.commit()
    conn.close()
    return path


def test_dry_run_matches_apply():
    legacy = _make_legacy()
    fd, target = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    fd, backup = tempfile.mkstemp(suffix=".sql")
    os.close(fd)
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{target}")
    old_url = os.environ.get("GUARDIAN_DB_URL")
    os.environ["GUARDIAN_DB_URL"] = f"sqlite:///{target}"
    command.upgrade(cfg, "head")
    dry = migrate_legacy.run(
        source_dsn=legacy,
        target_dsn="",
        migration_batch_id="",
        backup_path="",
        confirmation_phrase="",
        dry_run=True,
        verify=False,
    )
    assert dry["accounts"] == 1
    assert dry["entitlements"] == 1
    assert dry["audit"] == 1

    applied = migrate_legacy.run(
        source_dsn=legacy,
        target_dsn=f"sqlite:///{target}",
        migration_batch_id="b1",
        backup_path=backup,
        confirmation_phrase="MIGRATE LEGACY",
        dry_run=False,
        verify=False,
    )
    assert applied["accounts"] == dry["accounts"]
    assert applied["entitlements"] == dry["entitlements"]
    assert applied["audit"] == dry["audit"]

    # Verify v2 side: account + entitlement created.
    from sqlalchemy.orm import sessionmaker

    from guardian_cloud.persistence.engine import make_engine

    eng = make_engine(f"sqlite:///{target}")
    Local = sessionmaker(bind=eng, future=True)
    with Local() as s:
        acct = repository.get_account_by_email(s, "legacy@example.com")
        assert acct is not None
        ent = repository.get_latest_entitlement(s, acct.id)
        assert ent is not None
        assert ent.state == "ACTIVE"
    eng.dispose()
    if old_url is None:
        os.environ.pop("GUARDIAN_DB_URL", None)
    else:
        os.environ["GUARDIAN_DB_URL"] = old_url
    os.remove(legacy)
    os.remove(target)
    os.remove(backup)


def test_apply_requires_phrase():
    legacy = _make_legacy()
    try:
        migrate_legacy.run(
            source_dsn=legacy, target_dsn="sqlite:///:memory:", migration_batch_id="b",
            backup_path="x", confirmation_phrase="wrong", dry_run=False, verify=False,
        )
        raise AssertionError("expected PermissionError")
    except PermissionError:
        pass
    os.remove(legacy)
