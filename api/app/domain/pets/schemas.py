from typing import Literal

from pydantic import BaseModel, Field

Species = Literal["dog", "cat", "bird", "rabbit", "other"]


class PetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    species: Species
    color: str | None = Field(default=None, max_length=80)
    marks: str | None = Field(default=None, max_length=500)


class PetOut(BaseModel):
    id: str
    name: str
    species: str
    color: str | None
    marks: str | None


class PetList(BaseModel):
    items: list[PetOut]
