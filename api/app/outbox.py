from sqlalchemy import BigInteger, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.db import Base


class Outbox(Base):
    __tablename__ = "outbox"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    topic: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    published_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), index=True)


def enqueue(db: Session, topic: str, payload: dict) -> None:
    """เขียนงาน async ลงตารางใน transaction เดียวกับข้อมูลธุรกิจ — ไม่ publish ตรงเข้า broker
    เพื่อให้ broker ล่มแล้วข้อความไม่หาย"""
    db.add(Outbox(topic=topic, payload=payload))
