from __future__ import annotations

import os


def get_database_url() -> str:
    """Return the configured database URL without silently downgrading prod.

    SQLite is intentionally retained as the development/test default.  A
    production process must be explicitly configured with PostgreSQL so a
    missing secret cannot create a second, empty local database.
    """
    configured = (os.environ.get("GUARDIAN_DB_URL") or "").strip()
    if not is_production():
        return configured or "sqlite:///./guardian_dev.db"

    if not configured:
        raise RuntimeError("GUARDIAN_DB_URL is required when GUARDIAN_ENV is production")
    scheme = configured.split(":", 1)[0].lower()
    if scheme not in {"postgres", "postgresql"} and not scheme.startswith("postgresql+"):
        raise RuntimeError("GUARDIAN_DB_URL must use a PostgreSQL URL in production")
    return configured


def is_production() -> bool:
    return os.environ.get("GUARDIAN_ENV", "dev").strip().lower() in {"prod", "production"}
