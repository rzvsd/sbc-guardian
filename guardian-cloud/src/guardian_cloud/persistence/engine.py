from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine


def make_engine(url: str = "sqlite:///:memory:", echo: bool = False) -> Engine:
    """PostgreSQL is the only production truth. SQLite is allowed only for explicit unit tests."""
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    engine = create_engine(url, echo=echo, connect_args=connect_args, future=True)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
    return engine
