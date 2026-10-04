from celery import Celery
from celery.schedules import schedule

from app.config import get_settings

celery = Celery("pettech", broker=get_settings().rabbitmq_url, include=["worker.tasks"])
celery.conf.update(
    task_acks_late=True,            # ack หลังทำงานเสร็จ — worker ตายกลางทางงานกลับเข้าคิว
    worker_prefetch_multiplier=1,
    task_default_queue="pettech",
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "drain-outbox": {"task": "worker.tasks.drain_outbox", "schedule": schedule(5.0)},
    },
)
