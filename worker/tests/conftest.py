import uuid
from datetime import UTC, datetime

import pytest
from PIL import Image

from app.db import SessionLocal
from app.domain.auth.models import User
from app.domain.pets.models import Pet
from app.domain.reports.models import LostReport
from app.domain.sightings.models import Sighting

# reuse the api suite's schema bootstrap and per-test truncate (autouse) so the
# worker tests run against the same throwaway Postgres with a clean slate
from tests.conftest import _clean, _schema  # noqa: F401


@pytest.fixture
def db_session():
    with SessionLocal() as db:
        yield db


@pytest.fixture
def sighting_factory(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

    def _make(with_photo: bool = False) -> Sighting:
        tag = uuid.uuid4().hex[:8]
        owner = User(email=f"o{tag}@example.com", password_hash="x", display_name="เจ้าของ")
        finder = User(email=f"f{tag}@example.com", password_hash="x", display_name="คนพบ")
        db_session.add_all([owner, finder])
        db_session.flush()
        pet = Pet(owner_id=owner.id, name="ขาวมณี", species="cat")
        db_session.add(pet)
        db_session.flush()
        report = LostReport(pet_id=pet.id, owner_id=owner.id, last_seen_at=datetime.now(UTC),
                            district="บางกะปิ")
        db_session.add(report)
        db_session.flush()
        photo_key = None
        if with_photo:
            photo_key = f"{tag}.png"
            Image.new("RGB", (1200, 900), "white").save(tmp_path / photo_key)
        sighting = Sighting(report_id=report.id, finder_id=finder.id, photo_key=photo_key,
                            seen_at=datetime.now(UTC), district="บางกะปิ", idem_key=tag)
        db_session.add(sighting)
        db_session.commit()
        return sighting

    return _make
