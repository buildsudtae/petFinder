from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.relay import service
from app.domain.relay.schemas import MessageIn, MessageList, MessageOut

router = APIRouter(prefix="/api/reports", tags=["relay"])


@router.post("/{report_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
def send(report_id: str, payload: MessageIn, db: Session = Depends(get_session),
         user: User = Depends(current_user)):
    m = service.send_message(db, report_id, user, payload.body)
    return MessageOut(id=m.id, sender_display_name=user.display_name, body=m.body, created_at=m.created_at)


@router.get("/{report_id}/messages", response_model=MessageList)
def inbox(report_id: str, db: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = service.list_messages(db, report_id, user)
    return MessageList(items=[MessageOut(id=m.id, sender_display_name=name, body=m.body,
                                         created_at=m.created_at) for m, name in rows])
