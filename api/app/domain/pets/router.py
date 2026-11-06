from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import current_user
from app.domain.auth.models import User
from app.domain.pets import service
from app.domain.pets.schemas import PetIn, PetList, PetOut
from app.errors import AppError
from app.storage import delete_upload, save_upload, upload_url

router = APIRouter(prefix="/api/pets", tags=["pets"])


def _out(p) -> PetOut:
    return PetOut(id=str(p.id), name=p.name, species=p.species, color=p.color, marks=p.marks,
                  photo_url=upload_url(p.photo_key))


@router.post("", status_code=status.HTTP_201_CREATED, response_model=PetOut)
def create(payload: PetIn, db: Session = Depends(get_session), user: User = Depends(current_user)):
    return _out(service.create_pet(db, user, **payload.model_dump()))


@router.get("", response_model=PetList)
def list_pets(db: Session = Depends(get_session), user: User = Depends(current_user)):
    return PetList(items=[_out(p) for p in service.list_own_pets(db, user)])


@router.put("/{pet_id}/photo", response_model=PetOut)
def set_photo(pet_id: str, photo: UploadFile = File(...), db: Session = Depends(get_session),
              user: User = Depends(current_user)):
    pet = service.get_owned_pet_by_id(db, pet_id, user)     # 404/403 ก่อนเขียนไฟล์ลง volume
    if not photo.filename:
        raise AppError("VALIDATION", "กรุณาเลือกรูปสัตว์เลี้ยง", field="photo")
    key = save_upload(photo)
    try:
        previous = service.replace_photo(db, pet, key)
    except Exception:
        delete_upload(key)                                    # ไฟล์ต้องมีอายุเท่าแถว
        raise
    if previous:
        delete_upload(previous)
    return _out(pet)
