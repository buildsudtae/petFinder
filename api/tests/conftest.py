import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.db import Base
from app.main import app

DB_URL = os.environ["DATABASE_URL"]


def _assert_test_database() -> None:
    """Refuse to create_all/TRUNCATE anything but a database whose name ends in _test."""
    name = make_url(DB_URL).database or ""
    if not name.endswith("_test"):
        raise RuntimeError(
            f"refusing to run DB-mutating tests against database {name!r}: "
            "the name must end in '_test' (this fixture TRUNCATEs every table). "
            "Use ./scripts/test.sh; live-stack tests live in tests/concurrency (./scripts/race.sh)."
        )


@pytest.fixture(scope="session", autouse=True)
def _schema():
    _assert_test_database()
    engine = create_engine(DB_URL)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean():
    _assert_test_database()
    engine = create_engine(DB_URL)
    # later tasks add the other tables; only truncate those that exist so far
    existing = set(inspect(engine).get_table_names())
    with engine.begin() as conn:
        for t in ("notifications", "relay_messages", "relay_threads", "outbox", "report_events",
                  "sightings", "lost_reports", "pets", "users"):
            if t in existing:
                conn.execute(text(f"truncate table {t} cascade"))
    engine.dispose()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user(client):
    def _make(email: str | None = None, display_name: str = "ผู้ใช้ทดสอบ"):
        email = email or f"u{uuid.uuid4().hex[:8]}@example.com"
        r = client.post("/api/auth/register", json={
            "email": email, "password": "LongEnoughPassw0rd", "display_name": display_name})
        assert r.status_code == 201, r.text
        c = TestClient(app)
        login = c.post("/api/auth/login", json={"email": email, "password": "LongEnoughPassw0rd"})
        assert login.status_code == 200, login.text
        return {"client": c, "email": email, "id": r.json()["id"]}
    return _make


@pytest.fixture
def open_report(make_user):
    owner = make_user()
    pet = owner["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    r = owner["client"].post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
        "district": "บางกะปิ"})
    assert r.status_code == 201, r.text
    return {**owner, "id": r.json()["id"]}
