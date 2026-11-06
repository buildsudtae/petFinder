from datetime import datetime

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    thread_id: str | None = Field(default=None, max_length=36)   # เจ้าของใช้เลือกคู่สนทนาเมื่อมีผู้พบหลายคน


class ThreadOut(BaseModel):
    """id คือ id ของบทสนทนา ไม่ใช่ id ผู้ใช้ — ผู้พบเห็นเปิดเผยแค่ชื่อที่แสดงกับบริเวณที่แจ้ง (I6)"""

    id: str
    finder_display_name: str
    sighting_district: str | None
    sighting_area_note: str | None
    last_message: str | None
    last_message_at: datetime | None
    last_message_mine: bool
    unread_count: int


class ThreadList(BaseModel):
    items: list[ThreadOut]


class MessageOut(BaseModel):
    id: int
    sender_display_name: str
    body: str
    created_at: datetime
    mine: bool = False   # ผู้เรียกเป็นคนส่งเอง — ไม่ต้องเดาจากชื่อที่แสดง (ชื่อซ้ำกันได้) และไม่เปิด id ผู้ใช้


class MessageList(BaseModel):
    items: list[MessageOut]
