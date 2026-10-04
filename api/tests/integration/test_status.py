def test_owner_can_resolve_and_report_leaves_open_list(open_report, client):
    rid = open_report["id"]
    r = open_report["client"].patch(f"/api/reports/{rid}/status",
                                    json={"to": "RESOLVED", "reason": "เจอที่บ้านข้างๆ"})
    assert r.status_code == 200 and r.json()["status"] == "RESOLVED"
    assert [i["id"] for i in client.get("/api/reports").json()["items"]] == []


def test_non_owner_gets_403_without_leaking_report(make_user, open_report):
    other = make_user()
    r = other["client"].patch(f"/api/reports/{open_report['id']}/status",
                              json={"to": "RESOLVED", "reason": "x"})
    assert r.status_code == 403
    assert r.json() == {"code": "FORBIDDEN",
                        "message_th": "คุณไม่มีสิทธิ์แก้ประกาศนี้", "field": None}


def test_anonymous_gets_401(client, open_report):
    assert client.patch(f"/api/reports/{open_report['id']}/status",
                        json={"to": "RESOLVED", "reason": "x"}).status_code == 401


def test_sighting_after_resolve_is_409_report_closed(make_user, open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    from tests.integration.test_sightings import _post_sighting
    r = _post_sighting(make_user(), rid, idem="after-close")
    assert r.status_code == 409
    assert r.json()["code"] == "REPORT_CLOSED"
    assert "ปิดรับเบาะแส" in r.json()["message_th"]


def test_reopen_requires_reason(open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    r = open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "SEARCHING", "reason": "  "})
    assert r.status_code == 422
    assert r.json()["field"] == "reason"


def test_reopen_with_existing_sighting_returns_to_has_lead(make_user, open_report):
    rid = open_report["id"]
    from tests.integration.test_sightings import _post_sighting
    _post_sighting(make_user(), rid, idem="before-close")
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "คิดว่าเจอ"})

    r = open_report["client"].patch(f"/api/reports/{rid}/status",
                                    json={"to": "SEARCHING", "reason": "ตัวที่เจอไม่ใช่ของเรา"})
    assert r.status_code == 200
    assert r.json()["status"] == "HAS_LEAD"     # สถานะต้องไม่โกหก timeline ที่มีเบาะแสอยู่


def test_api_cannot_set_has_lead_directly(open_report):
    r = open_report["client"].patch(f"/api/reports/{open_report['id']}/status",
                                    json={"to": "HAS_LEAD", "reason": "อยากตั้งเอง"})
    assert r.status_code == 409
    assert r.json()["code"] == "INVALID_TRANSITION"


def test_every_status_change_is_recorded_as_event(open_report):
    rid = open_report["id"]
    open_report["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    events = open_report["client"].get(f"/api/reports/{rid}/events").json()["items"]
    assert [e["to_status"] for e in events] == ["SEARCHING", "RESOLVED"]
    assert events[-1]["reason"] == "เจอแล้ว"


def test_close_then_reopen_without_sightings_returns_to_searching_with_events(open_report):
    rid = open_report["id"]
    c = open_report["client"]
    c.patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})
    r = c.patch(f"/api/reports/{rid}/status", json={"to": "SEARCHING", "reason": "ไม่ใช่ตัวของเรา"})
    assert r.status_code == 200 and r.json()["status"] == "SEARCHING"
    events = c.get(f"/api/reports/{rid}/events").json()["items"]
    assert [(e["from_status"], e["to_status"]) for e in events] == [
        (None, "SEARCHING"), ("SEARCHING", "RESOLVED"), ("RESOLVED", "SEARCHING")]
    assert events[-1]["reason"] == "ไม่ใช่ตัวของเรา"
