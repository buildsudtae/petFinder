from pathlib import Path

from sqlalchemy import func, select

from app.domain.notifications.models import Notification
from app.outbox import Outbox


def test_handle_sighting_created_twice_creates_one_notification(db_session, sighting_factory):
    from worker.tasks import handle_sighting_created
    s = sighting_factory()

    handle_sighting_created(str(s.id))
    handle_sighting_created(str(s.id))            # at-least-once delivery

    count = db_session.scalar(select(func.count(Notification.id)))
    assert count == 1


def test_handle_sighting_created_writes_thumbnail_once(db_session, sighting_factory, tmp_path):
    from worker.tasks import handle_sighting_created
    s = sighting_factory(with_photo=True)

    handle_sighting_created(str(s.id))
    db_session.refresh(s)
    first_thumb = s.thumb_key
    assert first_thumb is not None
    assert (Path(tmp_path) / first_thumb).is_file()

    handle_sighting_created(str(s.id))
    db_session.refresh(s)
    assert s.thumb_key == first_thumb             # ไม่สร้างไฟล์ซ้ำ


def test_handle_status_changed_twice_notifies_each_finder_once(db_session, sighting_factory):
    from app.domain.relay.models import RelayThread
    from worker.tasks import handle_status_changed
    s = sighting_factory()
    db_session.add(RelayThread(report_id=s.report_id, finder_id=s.finder_id))
    db_session.commit()

    for _ in range(2):
        handle_status_changed(str(s.report_id), "SEARCHING", "RESOLVED")

    assert db_session.scalar(select(func.count(Notification.id))) == 1


def test_drain_outbox_publishes_and_marks_rows(db_session, sighting_factory, monkeypatch):
    import worker.tasks as tasks
    s = sighting_factory()
    db_session.add(Outbox(topic="sighting.created",
                          payload={"sighting_id": str(s.id), "report_id": str(s.report_id)}))
    db_session.commit()
    sent = []
    monkeypatch.setitem(tasks.ROUTES, "sighting.created", lambda p: sent.append(p))

    assert tasks.drain_outbox() == 1
    assert tasks.drain_outbox() == 0              # แถวที่ mark แล้วไม่ถูกหยิบซ้ำ
    assert len(sent) == 1
    assert db_session.scalar(select(func.count(Outbox.id)).where(Outbox.published_at.is_(None))) == 0


def test_drain_outbox_leaves_rows_pending_when_broker_is_down(db_session, monkeypatch):
    import worker.tasks as tasks
    db_session.add(Outbox(topic="sighting.created", payload={"sighting_id": "x", "report_id": "y"}))
    db_session.commit()

    def boom(_):
        raise ConnectionError("broker down")
    monkeypatch.setitem(tasks.ROUTES, "sighting.created", boom)

    assert tasks.drain_outbox() == 0              # ไม่ raise · ไม่ mark
    assert db_session.scalar(select(func.count(Outbox.id)).where(Outbox.published_at.is_(None))) == 1


def test_worker_process_registers_every_model_it_touches():
    # pytest has already imported app.main, which hides a missing model import; a fresh
    # interpreter mirrors the real worker process (celery never imports app.main)
    import subprocess
    import sys
    code = ("import worker.tasks; from app.db import Base; "
            "[t for t in Base.metadata.sorted_tables]; print('ok')")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
