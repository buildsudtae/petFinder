import logging
import uuid
from datetime import UTC, datetime

from PIL import Image
from sqlalchemy import select, update

from app.db import SessionLocal
# the worker never imports app.main, so register the FK targets (users, pets) explicitly;
# without them the first flush fails with NoReferencedTableError
from app.domain.auth import models as _auth_models  # noqa: F401
from app.domain.pets import models as _pets_models  # noqa: F401
from app.domain.notifications.service import notify_once
from app.domain.relay.models import RelayThread
from app.domain.reports.models import LostReport
from app.domain.sightings.models import Sighting
from app.outbox import Outbox
from app.storage import upload_dir
from worker.celery_app import celery

log = logging.getLogger(__name__)
THUMB_MAX = (480, 480)


# a handler that raises is acked by acks_late and the outbox row is already published, so
# without autoretry the work would be lost silently; handlers are idempotent so retries are safe
RETRY = dict(autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=5)


@celery.task(name="worker.tasks.handle_sighting_created", **RETRY)
def handle_sighting_created(sighting_id: str) -> None:
    with SessionLocal() as db:
        sighting = db.get(Sighting, uuid.UUID(sighting_id))
        if sighting is None:
            return                                  # เบาะแสถูกลบไปแล้ว — ไม่ใช่ error
        report = db.get(LostReport, sighting.report_id)
        if report is None:
            log.warning("sighting %s has no report; skipping", sighting_id)
            return                                  # สถานะที่กู้ไม่ได้ — retry ก็ไม่ช่วย

        # idempotent: unique (user_id, dedupe_key) — ส่งซ้ำได้ แจ้งเตือนเดียว
        notify_once(db, report.owner_id, "sighting.created",
                    dedupe_key=f"sighting:{sighting.id}",
                    payload={"report_id": str(report.id), "sighting_id": str(sighting.id)})

        # idempotent: ข้ามถ้ามี thumb_key แล้ว · ชื่อไฟล์ deterministic · UPDATE มีเงื่อนไข thumb_key IS NULL
        if sighting.photo_key and not sighting.thumb_key:
            root = upload_dir()
            src = root / sighting.photo_key
            if src.is_file():
                thumb_key = f"thumb_{sighting.photo_key}"
                with Image.open(src) as im:
                    im.thumbnail(THUMB_MAX)
                    im.save(root / thumb_key)
                db.execute(update(Sighting).where(Sighting.id == sighting.id,
                                                  Sighting.thumb_key.is_(None))
                           .values(thumb_key=thumb_key))
                db.commit()


@celery.task(name="worker.tasks.handle_status_changed", **RETRY)
def handle_status_changed(report_id: str, from_status: str, to_status: str, event_id: int) -> None:
    rid = uuid.UUID(report_id)
    with SessionLocal() as db:
        finders = list(db.scalars(select(RelayThread.finder_id).where(RelayThread.report_id == rid)))
        for finder_id in finders:
            # idempotent: unique (user_id, dedupe_key) ต่อผู้พบแต่ละคน
            notify_once(db, finder_id, "report.status_changed",
                        dedupe_key=f"status-event:{event_id}",
                        payload={"report_id": report_id, "from": from_status, "to": to_status})


ROUTES = {
    "sighting.created": lambda p: handle_sighting_created.delay(p["sighting_id"]),
    "report.status_changed": lambda p: handle_status_changed.delay(p["report_id"], p["from"], p["to"], p["event_id"]),
}


@celery.task(name="worker.tasks.drain_outbox")
def drain_outbox() -> int:
    """ดูดงานที่ยังไม่ publish ส่งเข้า broker แล้ว mark — ล็อกแถวกัน beat ซ้อนกันหยิบงานเดียวกัน
    broker ล่ม: หยุดรอบนี้ แถวที่ยังไม่ส่งค้างใน outbox รอบหน้าลองใหม่ (ไม่ raise ไม่ mark)"""
    sent = 0
    with SessionLocal() as db:
        rows = db.execute(
            select(Outbox).where(Outbox.published_at.is_(None))
            .order_by(Outbox.id).limit(100).with_for_update(skip_locked=True)
        ).scalars().all()
        for row in rows:
            handler = ROUTES.get(row.topic)
            if handler is None:
                row.published_at = datetime.now(UTC)   # topic ที่ไม่รู้จัก: mark ทิ้ง ไม่ให้ค้างคิว
                continue
            try:
                handler(row.payload)
            except Exception:
                log.warning("outbox publish failed (id=%s); leaving rows pending", row.id, exc_info=True)
                break
            row.published_at = datetime.now(UTC)
            sent += 1
        db.commit()
    return sent
