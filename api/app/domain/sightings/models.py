import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Sighting(Base):
    __tablename__ = "sightings"
    __table_args__ = (
        # I2 — กันเบาะแสซ้ำที่ระดับฐานข้อมูล ไม่ใช่ pre-SELECT ที่ race ได้
        UniqueConstraint("report_id", "finder_id", "idem_key", name="uq_sightings_idem"),
        Index("ix_sightings_report_created", "report_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_reports.id", ondelete="CASCADE"), nullable=False)
    finder_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    photo_key: Mapped[str | None] = mapped_column(String(200))
    thumb_key: Mapped[str | None] = mapped_column(String(200))
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    area_note: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(1000))
    idem_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
