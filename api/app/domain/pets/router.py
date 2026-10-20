from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.pets import service
from app.domain.pets.schemas import PetIn, PetList, PetOut

router = APIRouter(prefix="/api/pets", tags=["pets"])


def _out(p) -> PetOut:
    return PetOut(id=str(p.id), name=p.name, species=p.species, color=p.color, marks=p.marks)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PetOut)
def create(payload: PetIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    return _out(service.create_pet(db, user, **payload.model_dump()))


@router.get("", response_model=PetList)
def list_pets(db: Session = Depends(get_session), user: User = Depends(current_user)):
    return PetList(items=[_out(p) for p in service.list_own_pets(db, user)])
