from __future__ import annotations

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from guardian_cloud.api import deps
from guardian_cloud.api.app import create_app
from guardian_cloud.persistence import repository as repo
from guardian_cloud.persistence.engine import make_engine
from guardian_cloud.persistence.models import Base


@pytest.fixture
def engine():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    eng = make_engine(f"sqlite:///{path}")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()
    os.remove(path)


@pytest.fixture
def session(engine) -> Session:
    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    with Local() as s:
        yield s

@pytest.fixture
def client(session) -> TestClient:
    app = create_app()

    def _get_session():
        yield session

    app.dependency_overrides[deps.get_session] = _get_session
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers(session) -> tuple[dict[str, str], str]:
    """Session-based auth headers (server-issued device nonce)."""
    acct = repo.create_account(session, "acc-0001@example.com", "SUBSCRIBER")
    repo.set_entitlement(
        session,
        acct.id,
        plan="guardian-pro",
        state="ACTIVE",
        until=None,
        reason="test fixture",
    )
    session.commit()
    ds = repo.create_device_session(
        session,
        acct.id,
        session_nonce=deps.make_session_nonce(),
        token_hash="th",
        refresh_token_hash="rh",
        expires_at=deps.default_session_expiry(),
    )
    session.commit()
    return {"X-Guardian-Session": ds.session_nonce}, acct.id


@pytest.fixture
def other_auth_headers(session) -> tuple[dict[str, str], str]:
    acct = repo.create_account(session, "other@example.com", "SUBSCRIBER")
    repo.set_entitlement(
        session,
        acct.id,
        plan="guardian-pro",
        state="ACTIVE",
        until=None,
        reason="test fixture",
    )
    session.commit()
    ds = repo.create_device_session(
        session,
        acct.id,
        session_nonce=deps.make_session_nonce(),
        token_hash="th2",
        refresh_token_hash="rh2",
        expires_at=deps.default_session_expiry(),
    )
    session.commit()
    return {"X-Guardian-Session": ds.session_nonce}, acct.id


@pytest.fixture
def real_client(engine) -> TestClient:
    """Client that uses the REAL get_session dependency (no override), so the
    transaction model (commit/rollback) is exercised end-to-end."""
    old = deps.SessionLocal
    deps.SessionLocal = sessionmaker(bind=engine, future=True, autoflush=False)
    app = create_app()
    with TestClient(app) as c:
        yield c
    deps.SessionLocal = old


@pytest.fixture
def fresh_session(engine) -> Session:
    """A brand-new session bound to the same engine, for cross-request checks."""
    Local = sessionmaker(bind=engine, future=True, autoflush=False)
    with Local() as s:
        yield s
