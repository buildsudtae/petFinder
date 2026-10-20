import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.errors import AppError


def create_pet(db: Session, user: User, **fields) -> Pet:
    pet = Pet(owner_id=user.id, **fields)
    db.add(pet)
    db.commit()
    return pet


def list_own_pets(db: Session, user: User) -> list[Pet]:
    return list(db.scalars(select(Pet).where(Pet.owner_id == user.id).order_by(Pet.created_at)))


def get_owned_pet(db: Session, pet_id: uuid.UUID, user: User) -> Pet:
    pet = db.get(Pet, pet_id)
    if pet is None:
        raise AppError("NOT_FOUND", "ไม่พบสัตว์เลี้ยงที่ระบุ")
    if pet.owner_id != user.id:
        raise AppError("FORBIDDEN", "คุณไม่มีสิทธิ์จัดการสัตว์เลี้ยงตัวนี้")
    return pet
