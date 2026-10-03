import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from app.db import Base
from app.main import app

DB_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    engine = create_engine(DB_URL)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean():
    engine = create_engine(DB_URL)
    # later tasks add the other tables; only truncate those that exist so far
    existing = set(inspect(engine).get_table_names())
    with engine.begin() as conn:
        for t in ("relay_messages", "relay_threads", "outbox", "report_events",
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
