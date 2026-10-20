from sqlalchemy import select

from app.config import Settings
from app.db import SessionLocal
from app.outbox import Outbox


def test_sighting_writes_unpublished_outbox_row(make_user, open_report):
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(make_user(), open_report["id"], idem="ob-1")

    with SessionLocal() as db:
        rows = list(db.scalars(select(Outbox).where(Outbox.topic == "sighting.created")))
    assert len(rows) == 1
    assert rows[0].published_at is None          # request path ไม่ publish เอง


def test_api_still_accepts_sighting_when_broker_is_unreachable(make_user, open_report, monkeypatch):
    monkeypatch.setenv("RABBITMQ_URL", "amqp://nobody:nobody@127.0.0.1:1/")
    from tests.integration.test_sightings import _post_sighting
    assert _post_sighting(make_user(), open_report["id"], idem="ob-2").status_code == 201


def test_status_change_writes_outbox_row(open_report):
    open_report["client"].patch(f"/api/reports/{open_report['id']}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    with SessionLocal() as db:
        rows = list(db.scalars(select(Outbox).where(Outbox.topic == "report.status_changed")))
    assert len(rows) == 1 and rows[0].published_at is None


def test_ready_degrades_instead_of_failing_when_broker_is_down(client, monkeypatch):
    import app.main as main
    dead = Settings(rabbitmq_url="amqp://nobody:nobody@127.0.0.1:1//")
    monkeypatch.setattr(main, "get_settings", lambda: dead)
    r = client.get("/api/ready")
    assert r.status_code == 200                  # ห้าม 500 — broker ล่มแค่ degraded
    assert r.json()["broker"] is False
    assert r.json()["status"] == "degraded"
