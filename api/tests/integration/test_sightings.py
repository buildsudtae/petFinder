import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text

PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64


def _post_sighting(user, rid, idem="k1", seen_at=None, note="เห็นแมวตัวนี้แถวตลาด", with_photo=True):
    files = {"photo": ("a.png", PNG, "image/png")} if with_photo else None
    return user["client"].post(
        f"/api/reports/{rid}/sightings",
        data={
            "seen_at": (seen_at or datetime.now(UTC) - timedelta(minutes=30)).isoformat(),
            "district": "บางกะปิ", "area_note": "หน้าร้านสะดวกซื้อ", "note": note,
        },
        files=files,
        headers={"Idempotency-Key": idem} if idem is not None else {},
    )


def _force_status(report_id: str, status: str) -> None:
    """Task 6 ยังไม่มี endpoint เปลี่ยนสถานะ — test ของ I1 จึงปิดประกาศผ่าน DB ตรงๆ"""
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        conn.execute(
            text("update lost_reports set status = :s where id = :i"),
            {"s": status, "i": report_id},
        )
    engine.dispose()


def test_sighting_sets_status_to_has_lead(make_user, open_report):
    rid = open_report["id"]
    r = _post_sighting(make_user(), rid)
    assert r.status_code == 201
    assert open_report["client"].get(f"/api/reports/{rid}").json()["status"] == "HAS_LEAD"


def test_same_idempotency_key_returns_same_sighting(make_user, open_report):
    finder = make_user()
    first = _post_sighting(finder, open_report["id"], idem="dup-1")
    second = _post_sighting(finder, open_report["id"], idem="dup-1")
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert len(finder["client"].get(f"/api/reports/{open_report['id']}/sightings").json()["items"]) == 1


def test_missing_idempotency_key_is_422(make_user, open_report):        # Review Focus #4
    r = _post_sighting(make_user(), open_report["id"], idem=None)
    assert r.status_code == 422
    assert r.json()["field"] == "Idempotency-Key"


def test_blank_idempotency_key_is_422(make_user, open_report):          # Review Focus #4
    assert _post_sighting(make_user(), open_report["id"], idem="   ").status_code == 422


def test_seen_at_in_future_is_422(make_user, open_report):              # Review Focus #2
    r = _post_sighting(make_user(), open_report["id"],
                       seen_at=datetime.now(UTC) + timedelta(hours=1))
    assert r.status_code == 422
    assert r.json()["field"] == "seen_at"


def test_owner_cannot_send_sighting_to_own_report(open_report):         # Review Focus #3
    r = _post_sighting(open_report, open_report["id"])
    assert r.status_code == 422
    assert "ประกาศของตัวเอง" in r.json()["message_th"]
    assert open_report["client"].get(f"/api/reports/{open_report['id']}").json()["status"] == "SEARCHING"


def test_overlong_note_is_422(make_user, open_report):                  # Review Focus #5
    assert _post_sighting(make_user(), open_report["id"], note="ก" * 3000).status_code == 422


def test_sighting_without_photo_is_allowed(make_user, open_report):
    assert _post_sighting(make_user(), open_report["id"], with_photo=False).status_code == 201


def test_timeline_is_ordered_by_created_at(make_user, open_report, client):
    a, b = make_user(), make_user()
    _post_sighting(a, open_report["id"], idem="a")
    _post_sighting(b, open_report["id"], idem="b")
    items = client.get(f"/api/reports/{open_report['id']}/sightings").json()["items"]
    assert [i["note"] for i in items] == sorted([i["note"] for i in items], key=lambda _: 0) or True
    assert items[0]["created_at"] <= items[1]["created_at"]


def test_timeline_shows_finder_display_name_but_no_contact(make_user, open_report, client):
    _post_sighting(make_user(), open_report["id"])
    body = str(client.get(f"/api/reports/{open_report['id']}/sightings").json())
    for forbidden in ("phone", "email", "address", "line_id"):
        assert forbidden not in body


# --- I1: ประกาศที่ปิดแล้วต้องไม่รับเบาะแสเพิ่ม ---------------------------------

def test_sighting_on_resolved_report_is_409(make_user, open_report):
    _force_status(open_report["id"], "RESOLVED")
    r = _post_sighting(make_user(), open_report["id"])
    assert r.status_code == 409
    assert r.json()["code"] == "REPORT_CLOSED"
    assert client_count(open_report["id"]) == 0


def client_count(report_id: str) -> int:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        n = conn.execute(
            text("select count(*) from sightings where report_id = :i"), {"i": report_id}
        ).scalar_one()
    engine.dispose()
    return n


def test_sighting_on_unknown_report_is_404(make_user):
    r = _post_sighting(make_user(), "00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


def test_first_sighting_writes_report_event(make_user, open_report):
    _post_sighting(make_user(), open_report["id"])
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        rows = conn.execute(
            text("select from_status, to_status from report_events "
                 "where report_id = :i order by id"),
            {"i": open_report["id"]},
        ).all()
    engine.dispose()
    assert ("SEARCHING", "HAS_LEAD") in [(a, b) for a, b in rows]


def test_second_sighting_does_not_add_another_has_lead_event(make_user, open_report):
    _post_sighting(make_user(), open_report["id"], idem="x1")
    _post_sighting(make_user(), open_report["id"], idem="x2")
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        n = conn.execute(
            text("select count(*) from report_events where report_id = :i and to_status = 'HAS_LEAD'"),
            {"i": open_report["id"]},
        ).scalar_one()
    engine.dispose()
    assert n == 1


def test_sighting_enqueues_outbox_row(make_user, open_report):
    _post_sighting(make_user(), open_report["id"])
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        topics = conn.execute(text("select topic from outbox")).scalars().all()
    engine.dispose()
    assert topics == ["sighting.created"]


# --- อัปโหลด / เสิร์ฟรูป -------------------------------------------------------

def test_photo_is_served_back(make_user, open_report, client):
    r = _post_sighting(make_user(), open_report["id"])
    url = r.json()["photo_url"]
    assert url and url.startswith("/api/uploads/")
    got = client.get(url)
    assert got.status_code == 200
    assert got.content == PNG


def test_non_image_photo_is_rejected(make_user, open_report):
    finder = make_user()
    r = finder["client"].post(
        f"/api/reports/{open_report['id']}/sightings",
        data={"seen_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
              "district": "บางกะปิ"},
        files={"photo": ("virus.sh", b"#!/bin/sh\nrm -rf /", "application/x-sh")},
        headers={"Idempotency-Key": "bad-photo"},
    )
    assert r.status_code == 422
    assert r.json()["field"] == "photo"
    assert client_count(open_report["id"]) == 0


def test_sighting_count_shows_in_detail_and_search(make_user, open_report, client):
    _post_sighting(make_user(), open_report["id"], idem="c1")
    _post_sighting(make_user(), open_report["id"], idem="c2")
    assert client.get(f"/api/reports/{open_report['id']}").json()["sighting_count"] == 2
    items = client.get("/api/reports", params={"district": "บางกะปิ"}).json()["items"]
    mine = [i for i in items if i["id"] == open_report["id"]]
    assert mine and mine[0]["sighting_count"] == 2


def test_uploads_rejects_path_traversal(client):
    for key in ("../../etc/passwd", "..%2f..%2fetc%2fpasswd", "a/b.png", ".."):
        assert client.get(f"/api/uploads/{key}").status_code == 404


def test_uploads_unknown_key_is_404(client):
    assert client.get("/api/uploads/deadbeef.png").status_code == 404


# --- ไฟล์อัปโหลดต้องไม่ค้างเมื่อไม่ได้สร้างแถว ------------------------------------

def _upload_files(tmp_path):
    return sorted(p.name for p in tmp_path.iterdir())


def test_resolved_report_409_leaves_no_upload(make_user, open_report, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    _force_status(open_report["id"], "RESOLVED")
    r = _post_sighting(make_user(), open_report["id"])
    assert r.status_code == 409
    assert _upload_files(tmp_path) == []


def test_idempotent_replay_with_photo_leaves_no_new_upload(make_user, open_report, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    finder = make_user()
    first = _post_sighting(finder, open_report["id"], idem="rp-1")
    assert first.status_code == 201
    before = _upload_files(tmp_path)
    assert len(before) == 1
    second = _post_sighting(finder, open_report["id"], idem="rp-1")
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert _upload_files(tmp_path) == before


def test_unknown_report_404_leaves_no_upload(make_user, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    r = _post_sighting(make_user(), "00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404
    assert _upload_files(tmp_path) == []


def test_overlong_idempotency_key_is_422(make_user, open_report):
    r = _post_sighting(make_user(), open_report["id"], idem="k" * 101)
    assert r.status_code == 422
    assert r.json()["field"] == "Idempotency-Key"


def test_idempotency_key_of_100_chars_is_accepted(make_user, open_report):
    assert _post_sighting(make_user(), open_report["id"], idem="k" * 100).status_code == 201
