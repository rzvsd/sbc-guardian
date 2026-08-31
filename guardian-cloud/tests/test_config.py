from __future__ import annotations

import pytest

from guardian_cloud.config import get_database_url, is_production


def test_development_defaults_to_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GUARDIAN_DB_URL", raising=False)
    monkeypatch.setenv("GUARDIAN_ENV", "dev")

    assert get_database_url() == "sqlite:///./guardian_dev.db"
    assert is_production() is False


def test_production_requires_explicit_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GUARDIAN_DB_URL", raising=False)
    monkeypatch.setenv("GUARDIAN_ENV", "production")

    with pytest.raises(RuntimeError, match="GUARDIAN_DB_URL is required"):
        get_database_url()


@pytest.mark.parametrize("url", ["sqlite:///prod.db", "mysql://db.example/guardian"])
def test_production_rejects_non_postgresql_url(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("GUARDIAN_ENV", "prod")
    monkeypatch.setenv("GUARDIAN_DB_URL", url)

    with pytest.raises(RuntimeError, match="PostgreSQL URL"):
        get_database_url()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://guardian:secret@db.example/guardian",
        "postgresql+psycopg://guardian:secret@db.example/guardian",
        "postgres://guardian:secret@db.example/guardian",
    ],
)
def test_production_accepts_postgresql_urls(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("GUARDIAN_ENV", "prod")
    monkeypatch.setenv("GUARDIAN_DB_URL", url)

    assert get_database_url() == url
    assert is_production() is True
