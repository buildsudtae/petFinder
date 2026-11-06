import uuid

from app.db import SessionLocal
from app.domain.notifications.service import notify_once


def _notify(user, report_id: str, topic: str = "sighting.created", **extra) -> None:
    """แจ้งเตือนจริงมาจาก worker หลัง outbox — เทส API นี้จึงเขียนแถวด้วย service เดียวกับที่ worker ใช้"""
    with SessionLocal() as db:
        notify_once(db, uuid.UUID(user["id"]), topic, dedupe_key=uuid.uuid4().hex,
                    payload={"report_id": report_id, **extra})


def test_user_sees_only_own_notifications_newest_first(make_user):
    me, other = make_user(), make_user()
    _notify(me, "r-1")
    _notify(me, "r-2", topic="report.status_changed", to="RESOLVED")
    _notify(other, "r-3")
    body = me["client"].get("/api/notifications").json()
    assert [(n["topic"], n["report_id"]) for n in body["items"]] == [
        ("report.status_changed", "r-2"), ("sighting.created", "r-1")]
    assert body["items"][0]["status_to"] == "RESOLVED"
    assert body["unread_count"] == 2


def test_marking_one_report_read_leaves_other_reports_unread(make_user):
    me = make_user()
    _notify(me, "r-1")
    _notify(me, "r-1")
    _notify(me, "r-2")
    assert me["client"].post("/api/notifications/read", json={"report_id": "r-1"}).status_code == 204
    body = me["client"].get("/api/notifications").json()
    assert {n["report_id"]: n["read"] for n in body["items"]} == {"r-1": True, "r-2": False}
    assert body["unread_count"] == 1
    me["client"].post("/api/notifications/read", json={})
    assert me["client"].get("/api/notifications").json()["unread_count"] == 0


def test_notification_response_has_no_user_ids_or_contact(make_user):
    me = make_user()
    _notify(me, "r-1", sighting_id="s-1")
    item = me["client"].get("/api/notifications").json()["items"][0]
    assert set(item) == {"id", "topic", "report_id", "status_to", "created_at", "read"}
    assert me["id"] not in str(item) and me["email"] not in str(item)


def test_notifications_require_login(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read", json={}).status_code == 401
