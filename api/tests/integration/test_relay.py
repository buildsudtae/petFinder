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
    assert set(body) == {"id", "sender_display_name", "body", "created_at"}
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
