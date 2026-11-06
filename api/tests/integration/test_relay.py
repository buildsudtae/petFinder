import os
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import create_engine, text

from tests.integration.test_sightings import _post_sighting


def _send(user, rid, body="ตอนนี้แมวยังอยู่แถวนี้ครับ"):
    return user["client"].post(f"/api/reports/{rid}/messages", json={"body": body})


def test_finder_who_sent_sighting_can_message_owner(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="relay-1")

    assert _send(finder, open_report["id"]).status_code == 201
    items = open_report["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]
    assert len(items) == 1
    assert "phone" not in str(items) and "email" not in str(items)


def test_stranger_without_sighting_cannot_message(make_user, open_report):
    r = _send(make_user(), open_report["id"])
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"


def test_owner_can_reply_in_existing_thread(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="relay-2")
    _send(finder, open_report["id"])

    assert _send(open_report, open_report["id"], body="ขอบคุณครับ กำลังไป").status_code == 201
    assert len(finder["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]) == 2


def test_each_finder_sees_only_their_own_thread(make_user, open_report):
    f1, f2 = make_user(), make_user()
    _post_sighting(f1, open_report["id"], idem="t1")
    _post_sighting(f2, open_report["id"], idem="t2")
    _send(f1, open_report["id"], body="ข้อความของคนที่หนึ่ง")

    assert f2["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"] == []


def test_empty_message_is_422(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="relay-3")
    r = _send(finder, open_report["id"], body="   ")
    assert r.status_code == 422
    assert r.json()["field"] == "body"


# --- extras beyond the brief: the rules the task owns ---------------------------------

def test_owner_with_several_finder_threads_gets_422(make_user, open_report):
    f1, f2 = make_user(), make_user()
    _post_sighting(f1, open_report["id"], idem="m1")
    _post_sighting(f2, open_report["id"], idem="m2")
    _send(f1, open_report["id"])
    _send(f2, open_report["id"])
    r = _send(open_report, open_report["id"], body="ตอบใครดี")
    assert r.status_code == 422
    assert r.json()["field"] == "thread_id"


def test_owner_cannot_start_a_thread_when_no_finder_exists(open_report):
    r = _send(open_report, open_report["id"])
    assert r.status_code == 422


def test_stranger_cannot_read_messages_and_sees_empty_list(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="s1")
    _send(finder, open_report["id"])
    assert make_user()["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"] == []


def test_message_response_has_no_ids_or_contact_fields(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="p1")
    body = _send(finder, open_report["id"]).json()
    assert set(body) == {"id", "sender_display_name", "body", "created_at", "mine"}   # mine เป็น bool ไม่ใช่ id
    assert body["mine"] is True
    assert finder["email"] not in str(body) and finder["id"] not in str(body)


def test_unknown_report_is_404(make_user):
    import uuid
    assert _send(make_user(), str(uuid.uuid4())).status_code == 404


def test_concurrent_first_messages_create_exactly_one_thread(make_user, open_report):
    finder = make_user()
    _post_sighting(finder, open_report["id"], idem="c1")
    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(lambda i: _send(finder, open_report["id"], body=f"m{i}").status_code, range(8)))
    assert codes == [201] * 8
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as conn:
        n = conn.execute(text("select count(*) from relay_threads where report_id = :r"),
                         {"r": open_report["id"]}).scalar()
    engine.dispose()
    assert n == 1
    assert len(finder["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]) == 8


# --- review fix round 1 ----------------------------------------------------------------

def _msgs(user, rid):
    return [i["body"] for i in user["client"].get(f"/api/reports/{rid}/messages").json()["items"]]


def test_two_finders_with_threads_each_see_only_their_own_messages(make_user, open_report):
    f1, f2 = make_user(), make_user()
    rid = open_report["id"]
    _post_sighting(f1, rid, idem="iso1")
    _post_sighting(f2, rid, idem="iso2")
    _send(f1, rid, body="จากคนที่หนึ่ง")
    _send(f2, rid, body="จากคนที่สอง")
    assert _msgs(f1, rid) == ["จากคนที่หนึ่ง"]
    assert _msgs(f2, rid) == ["จากคนที่สอง"]


def test_owner_sees_messages_from_all_threads(make_user, open_report):
    f1, f2 = make_user(), make_user()
    rid = open_report["id"]
    _post_sighting(f1, rid, idem="own1")
    _post_sighting(f2, rid, idem="own2")
    _send(f1, rid, body="จากคนที่หนึ่ง")
    _send(f2, rid, body="จากคนที่สอง")
    assert sorted(_msgs(open_report, rid)) == sorted(["จากคนที่หนึ่ง", "จากคนที่สอง"])


def test_failed_thread_insert_is_loud_and_never_writes_into_another_finders_thread(
        make_user, open_report, monkeypatch):
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    from app.domain.relay.models import RelayThread

    f1, f2 = make_user(), make_user()
    rid = open_report["id"]
    _post_sighting(f1, rid, idem="bad1")
    _post_sighting(f2, rid, idem="bad2")
    assert _send(f1, rid, body="ของคนที่หนึ่ง").status_code == 201      # exactly one thread exists

    real_flush = Session.flush

    def failing_flush(self, *a, **kw):
        if any(isinstance(o, RelayThread) for o in self.new):         # FK-style error, not uq_relay_thread
            raise IntegrityError("insert relay_threads", {}, Exception("fk violation"))
        return real_flush(self, *a, **kw)

    monkeypatch.setattr(Session, "flush", failing_flush)
    try:
        status = _send(f2, rid, body="ต้องไม่ไปอยู่ใน thread ของคนอื่น").status_code
    except IntegrityError:
        status = 500
    monkeypatch.undo()

    assert status == 500
    assert _msgs(f1, rid) == ["ของคนที่หนึ่ง"]
    assert _msgs(f2, rid) == []


# --- เลือกคู่สนทนา (thread) และข้อความที่ยังไม่อ่าน -----------------------------

def _threads(user, rid):
    return user["client"].get(f"/api/reports/{rid}/threads")


def _two_finders_with_threads(make_user, open_report):
    f1, f2 = make_user(display_name="คุณฝน"), make_user(display_name="คุณต้น")
    for f, idem in ((f1, "th-1"), (f2, "th-2")):
        _post_sighting(f, open_report["id"], idem=idem)
        assert _send(f, open_report["id"], body=f"สวัสดีจาก{idem}").status_code == 201
    items = _threads(open_report, open_report["id"]).json()["items"]
    by_name = {t["finder_display_name"]: t["id"] for t in items}
    return f1, f2, by_name


def test_owner_lists_one_thread_per_finder_without_user_ids(make_user, open_report):
    f1, f2, by_name = _two_finders_with_threads(make_user, open_report)
    items = _threads(open_report, open_report["id"]).json()["items"]
    assert set(by_name) == {"คุณฝน", "คุณต้น"}
    for t in items:
        assert set(t) == {"id", "finder_display_name", "sighting_district", "sighting_area_note",
                          "last_message", "last_message_at", "last_message_mine", "unread_count"}
        assert t["sighting_district"] == "บางกะปิ"
        assert f1["id"] not in str(t) and f2["id"] not in str(t)
        assert f1["email"] not in str(t) and f2["email"] not in str(t)


def test_owner_replies_to_the_chosen_thread_when_several_finders_exist(make_user, open_report):
    f1, f2, by_name = _two_finders_with_threads(make_user, open_report)
    r = open_report["client"].post(f"/api/reports/{open_report['id']}/messages",
                                   json={"body": "ขอบคุณคุณฝน", "thread_id": by_name["คุณฝน"]})
    assert r.status_code == 201
    f1_bodies = [m["body"] for m in f1["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]]
    f2_bodies = [m["body"] for m in f2["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]]
    assert "ขอบคุณคุณฝน" in f1_bodies
    assert "ขอบคุณคุณฝน" not in f2_bodies


def test_owner_reads_only_the_chosen_thread(make_user, open_report):
    _, _, by_name = _two_finders_with_threads(make_user, open_report)
    items = open_report["client"].get(f"/api/reports/{open_report['id']}/messages",
                                      params={"thread_id": by_name["คุณต้น"]}).json()["items"]
    assert [m["body"] for m in items] == ["สวัสดีจากth-2"]


def test_thread_id_from_another_report_is_404(make_user, open_report):
    _, _, by_name = _two_finders_with_threads(make_user, open_report)
    other = open_report["client"].post("/api/reports", json={
        "pet_id": open_report["client"].get("/api/pets").json()["items"][0]["id"],
        "last_seen_at": "2026-01-01T00:00:00+00:00", "district": "บางนา"}).json()
    r = open_report["client"].post(f"/api/reports/{other['id']}/messages",
                                   json={"body": "ผิดห้อง", "thread_id": by_name["คุณฝน"]})
    assert r.status_code == 404


def test_finder_cannot_use_another_finders_thread(make_user, open_report):
    f1, _, by_name = _two_finders_with_threads(make_user, open_report)
    rid = open_report["id"]
    send = f1["client"].post(f"/api/reports/{rid}/messages", json={"body": "แอบ", "thread_id": by_name["คุณต้น"]})
    read = f1["client"].get(f"/api/reports/{rid}/messages", params={"thread_id": by_name["คุณต้น"]})
    mark = f1["client"].post(f"/api/reports/{rid}/threads/{by_name['คุณต้น']}/read")
    assert (send.status_code, read.status_code, mark.status_code) == (403, 403, 403)
    assert "สวัสดีจากth-2" not in read.text


def test_finder_sees_only_own_thread_and_stranger_sees_none(make_user, open_report):
    f1, _, _ = _two_finders_with_threads(make_user, open_report)
    mine = _threads(f1, open_report["id"]).json()["items"]
    assert [t["finder_display_name"] for t in mine] == ["คุณฝน"]
    assert _threads(make_user(), open_report["id"]).json()["items"] == []


def test_threads_require_login(client, open_report):
    assert client.get(f"/api/reports/{open_report['id']}/threads").status_code == 401


def test_unread_count_counts_the_other_side_and_clears_after_read(make_user, open_report):
    f1, _, by_name = _two_finders_with_threads(make_user, open_report)
    rid, tid = open_report["id"], by_name["คุณฝน"]
    _send(f1, rid, body="ยังอยู่ที่เดิมครับ")

    def owner_unread():
        return {t["id"]: t["unread_count"] for t in _threads(open_report, rid).json()["items"]}[tid]

    assert owner_unread() == 2
    assert open_report["client"].post(f"/api/reports/{rid}/threads/{tid}/read").status_code == 204
    assert owner_unread() == 0
    # ข้อความของตัวเองไม่นับเป็นข้อความใหม่ ส่วนอีกฝั่งเห็นเป็นข้อความใหม่ 1
    open_report["client"].post(f"/api/reports/{rid}/messages", json={"body": "กำลังไปครับ", "thread_id": tid})
    assert owner_unread() == 0
    assert _threads(f1, rid).json()["items"][0]["unread_count"] == 1


def test_mine_flag_marks_only_the_callers_own_messages_even_with_same_display_name(make_user, open_report):
    # ชื่อที่แสดงซ้ำกันได้ — หน้าเว็บต้องรู้ว่าข้อความไหนเป็นของตัวเองจาก mine ไม่ใช่จากชื่อ
    finder = make_user(display_name="ผู้ใช้ทดสอบ")          # ชื่อเดียวกับเจ้าของใน fixture
    _post_sighting(finder, open_report["id"], idem="mine-1")
    _send(finder, open_report["id"], body="จากผู้พบ")
    _send(open_report, open_report["id"], body="จากเจ้าของ")
    owner_view = {m["body"]: m["mine"] for m in open_report["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]}
    finder_view = {m["body"]: m["mine"] for m in finder["client"].get(f"/api/reports/{open_report['id']}/messages").json()["items"]}
    assert owner_view == {"จากผู้พบ": False, "จากเจ้าของ": True}
    assert finder_view == {"จากผู้พบ": True, "จากเจ้าของ": False}
