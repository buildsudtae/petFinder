from datetime import UTC, datetime, timedelta

import pytest


def _mk_report(u, **over):
    pet = u["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    body = {
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat(),
        "district": "บางกะปิ",
        "area_note": "ปากซอยหมู่บ้าน",
        "description": "ใส่ปลอกคอสีแดง",
    }
    body.update(over)
    return u["client"].post("/api/reports", json=body)


def test_create_report_starts_as_searching(make_user):
    r = _mk_report(make_user())
    assert r.status_code == 201
    assert r.json()["status"] == "SEARCHING"


def test_cannot_create_report_for_someone_elses_pet(make_user):
    a, b = make_user(), make_user()
    pet = a["client"].post("/api/pets", json={"name": "x", "species": "dog"}).json()
    r = b["client"].post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "district": "ห้วยขวาง"})
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"
    assert "pet" not in r.json()            # ไม่หลุดข้อมูล resource


def test_last_seen_at_in_the_future_is_rejected(make_user):          # Review Focus #2
    r = _mk_report(make_user(), last_seen_at=(datetime.now(UTC) + timedelta(hours=3)).isoformat())
    assert r.status_code == 422
    assert r.json()["field"] == "last_seen_at"


def test_blank_district_and_overlong_description_are_rejected(make_user):   # Review Focus #5
    u = make_user()
    assert _mk_report(u, district="   ").status_code == 422
    assert _mk_report(u, description="ก" * 5000).status_code == 422


def test_list_hides_resolved_reports_by_default(make_user, client):
    u = make_user()
    rid = _mk_report(u).json()["id"]
    u["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED", "reason": "เจอแล้ว"})

    assert [i["id"] for i in client.get("/api/reports").json()["items"]] == []
    assert [i["id"] for i in client.get("/api/reports?status=RESOLVED").json()["items"]] == [rid]


def test_public_detail_has_no_owner_contact(make_user, client):
    rid = _mk_report(make_user()).json()["id"]
    body = client.get(f"/api/reports/{rid}").json()
    flat = str(body)
    for forbidden in ("phone", "address", "line_id", "email", "password"):
        assert forbidden not in flat


# --- is_owner / mine (Task 10 extension) -------------------------------------------------

def test_anonymous_list_and_detail_have_is_owner_false(make_user, client):
    owner = make_user()
    rid = _mk_report(owner).json()["id"]
    items = client.get("/api/reports").json()["items"]
    assert items and all(i["is_owner"] is False for i in items)
    assert client.get(f"/api/reports/{rid}").json()["is_owner"] is False
    assert "owner_id" not in client.get(f"/api/reports/{rid}").json()


def test_is_owner_true_only_for_the_owner(make_user):
    owner, other = make_user(), make_user()
    created = _mk_report(owner)
    rid = created.json()["id"]
    assert created.json()["is_owner"] is True
    assert owner["client"].get(f"/api/reports/{rid}").json()["is_owner"] is True
    assert other["client"].get(f"/api/reports/{rid}").json()["is_owner"] is False
    mine_flags = {i["id"]: i["is_owner"] for i in owner["client"].get("/api/reports").json()["items"]}
    assert mine_flags[rid] is True
    other_flags = {i["id"]: i["is_owner"] for i in other["client"].get("/api/reports").json()["items"]}
    assert other_flags[rid] is False


def test_tampered_cookie_is_anonymous_not_an_error(make_user, client):
    rid = _mk_report(make_user()).json()["id"]
    client.cookies.set("pettech_session", "not-a-jwt")
    r = client.get(f"/api/reports/{rid}")
    assert r.status_code == 200 and r.json()["is_owner"] is False


def test_mine_requires_login(client):
    r = client.get("/api/reports?mine=true")
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_REQUIRED"


def test_mine_returns_own_reports_in_every_status_and_not_others(make_user):
    owner, other = make_user(), make_user()
    open_id = _mk_report(owner).json()["id"]
    closed_id = _mk_report(owner).json()["id"]
    other_id = _mk_report(other).json()["id"]
    assert owner["client"].patch(f"/api/reports/{closed_id}/status", json={"to": "RESOLVED"}).status_code == 200

    ids = {i["id"] for i in owner["client"].get("/api/reports?mine=true").json()["items"]}
    assert ids == {open_id, closed_id}
    assert other_id not in ids
    assert closed_id not in {i["id"] for i in owner["client"].get("/api/reports").json()["items"]}   # ไม่ใส่ mine = เหมือนเดิม
    only_closed = owner["client"].get("/api/reports?mine=true&status=RESOLVED").json()["items"]
    assert [i["id"] for i in only_closed] == [closed_id]


# --- ตัวกรอง, รวมที่พบแล้ว, หน้าถัดไป, วันที่พบ ---------------------------------

def test_species_filter_returns_only_that_species(make_user, client):
    u = make_user()
    cat = _mk_report(u).json()["id"]                      # _mk_report สร้างแมว
    dog_pet = u["client"].post("/api/pets", json={"name": "โกโก้", "species": "dog"}).json()
    dog = u["client"].post("/api/reports", json={
        "pet_id": dog_pet["id"], "last_seen_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "district": "บางกะปิ"}).json()["id"]
    assert [i["id"] for i in client.get("/api/reports?species=dog").json()["items"]] == [dog]
    assert [i["id"] for i in client.get("/api/reports?species=cat").json()["items"]] == [cat]


def test_district_filter_excludes_other_districts(make_user, client):
    u = make_user()
    here = _mk_report(u, district="ลาดพร้าว").json()["id"]
    _mk_report(u, district="บางนา")
    assert [i["id"] for i in client.get("/api/reports", params={"district": "ลาดพร้าว"}).json()["items"]] == [here]


def test_include_resolved_lists_open_and_resolved_together(make_user, client):
    u = make_user()
    open_id = _mk_report(u).json()["id"]
    closed_id = _mk_report(u).json()["id"]
    u["client"].patch(f"/api/reports/{closed_id}/status", json={"to": "RESOLVED"})
    assert {i["id"] for i in client.get("/api/reports?include_resolved=true").json()["items"]} == {open_id, closed_id}
    assert [i["id"] for i in client.get("/api/reports").json()["items"]] == [open_id]


def test_cursor_pages_through_every_report_once_newest_first(make_user, client):
    u = make_user()
    created = [_mk_report(u).json()["id"] for _ in range(5)]
    seen, cursor, pages = [], None, 0
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = client.get("/api/reports", params=params).json()
        seen += [i["id"] for i in body["items"]]
        pages += 1
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == 3
    assert seen == list(reversed(created))


def test_invalid_cursor_is_422(client):
    r = client.get("/api/reports", params={"cursor": "not-a-cursor"})
    assert r.status_code == 422
    assert r.json()["field"] == "cursor"


def test_resolved_at_is_set_on_close_and_cleared_on_reopen(make_user, client):
    u = make_user()
    rid = _mk_report(u).json()["id"]
    assert client.get(f"/api/reports/{rid}").json()["resolved_at"] is None
    u["client"].patch(f"/api/reports/{rid}/status", json={"to": "RESOLVED"})
    assert client.get(f"/api/reports/{rid}").json()["resolved_at"] is not None
    u["client"].patch(f"/api/reports/{rid}/status", json={"to": "SEARCHING", "reason": "ปิดผิดตัว"})
    assert client.get(f"/api/reports/{rid}").json()["resolved_at"] is None
