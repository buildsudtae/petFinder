from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.relay import service
from app.domain.relay.schemas import MessageIn, MessageList, MessageOut, ThreadList, ThreadOut

router = APIRouter(prefix="/api/reports", tags=["relay"])


@router.post("/{report_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageOut)
def send(report_id: str, payload: MessageIn, db: Session = Depends(get_session),
         user: User = Depends(current_user)):
    m = service.send_message(db, report_id, user, payload.body, payload.thread_id)
    return MessageOut(id=m.id, sender_display_name=user.display_name, body=m.body, created_at=m.created_at,
                      mine=True)


@router.get("/{report_id}/messages", response_model=MessageList)
def inbox(report_id: str, thread_id: str | None = Query(default=None, max_length=36),
          db: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = service.list_messages(db, report_id, user, thread_id)
    return MessageList(items=[MessageOut(id=m.id, sender_display_name=name, body=m.body,
                                         created_at=m.created_at, mine=m.sender_id == user.id)
                                for m, name in rows])


@router.get("/{report_id}/threads", response_model=ThreadList)
def threads(report_id: str, db: Session = Depends(get_session), user: User = Depends(current_user)):
    return ThreadList(items=[ThreadOut(**t) for t in service.list_threads(db, report_id, user)])


@router.post("/{report_id}/threads/{thread_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(report_id: str, thread_id: str, db: Session = Depends(get_session),
              user: User = Depends(current_user)):
    service.mark_read(db, report_id, user, thread_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
