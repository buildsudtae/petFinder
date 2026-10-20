from datetime import datetime

from pydantic import BaseModel, Field


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)


class MessageOut(BaseModel):
    id: int
    sender_display_name: str
    body: str
    created_at: datetime


class MessageList(BaseModel):
    items: list[MessageOut]
