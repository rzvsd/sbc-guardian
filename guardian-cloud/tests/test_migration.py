import os
import tempfile
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

ROOT = Path(__file__).parent.parent  # guardian-cloud/


def test_alembic_single_head_and_upgrade():
    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    url = f"sqlite:///{db_path}"
    os.environ["GUARDIAN_DB_URL"] = url
    try:
        cfg = Config(str(ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(ROOT / "migrations"))

        heads = command.heads(cfg)
        # alembic prints heads and returns None when there is exactly one head
        assert heads is None or (isinstance(heads, list) and len(heads) == 1), heads

        command.upgrade(cfg, "head")
        command.current(cfg)
        command.upgrade(cfg, "head")  # idempotent no-op at head

        from sqlalchemy import text

        eng = create_engine(url)
        with eng.connect() as conn:
            rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
            assert len(rows) == 1
            assert rows[0][0] == "20260827_0001_v2_base"
        eng.dispose()

        eng = create_engine(url)
        tables = set(inspect(eng).get_table_names())
        for required in [
            "accounts",
            "club_snapshots",
            "guardian_policies",
            "solutions",
            "solution_items",
            "consumed_items",
            "scoring_rulesets",
            "scoring_entries",
            "audit_events",
            "privacy_preferences",
            "device_sessions",
            "pairings",
        ]:
            assert required in tables, required
        scoring_columns = {column["name"] for column in inspect(eng).get_columns("scoring_entries")}
        assert {"rating", "scoring_category", "points"}.issubset(scoring_columns)
        assert "item_id" not in scoring_columns
        active_indexes = {index["name"] for index in inspect(eng).get_indexes("scoring_rulesets")}
        assert "uq_active_scoring_ruleset_edition" in active_indexes
        eng.dispose()

        migration_source = (ROOT / "migrations" / "versions" / "20260827_0001_v2_base.py").read_text()
        assert "create_all" not in migration_source
    finally:
        os.remove(db_path)
