import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

SEARCHING = "SEARCHING"
HAS_LEAD = "HAS_LEAD"
RESOLVED = "RESOLVED"
OPEN_STATUSES = (SEARCHING, HAS_LEAD)
ALL_STATUSES = (SEARCHING, HAS_LEAD, RESOLVED)


class Status:
    SEARCHING = SEARCHING
    HAS_LEAD = HAS_LEAD
    RESOLVED = RESOLVED


class LostReport(Base):
    __tablename__ = "lost_reports"
    __table_args__ = (
        CheckConstraint(f"status in {ALL_STATUSES}", name="ck_lost_reports_status"),
        Index("ix_lost_reports_status_district", "status", "district"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pet_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=SEARCHING)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    district: Mapped[str] = mapped_column(String(80), nullable=False)
    area_note: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReportEvent(Base):
    __tablename__ = "report_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lost_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
