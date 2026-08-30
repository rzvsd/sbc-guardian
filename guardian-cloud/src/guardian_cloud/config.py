from __future__ import annotations

import os


def get_database_url() -> str:
    return os.environ.get("GUARDIAN_DB_URL", "sqlite:///./guardian_dev.db")


def is_production() -> bool:
    return os.environ.get("GUARDIAN_ENV", "dev") == "prod"
