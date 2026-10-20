def test_owner_sees_only_own_pets(make_user):
    a, b = make_user(), make_user()
    a["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat", "color": "ขาว"})
    b["client"].post("/api/pets", json={"name": "ไข่เจียว", "species": "dog"})

    names = [p["name"] for p in a["client"].get("/api/pets").json()["items"]]
    assert names == ["ขาวมณี"]


def test_species_must_be_known_value(make_user):
    u = make_user()
    r = u["client"].post("/api/pets", json={"name": "x", "species": "dragon"})
    assert r.status_code == 422
    assert r.json()["code"] == "VALIDATION"
    assert r.json()["field"] == "species"


def test_creating_pet_requires_login(client):
    assert client.post("/api/pets", json={"name": "x", "species": "cat"}).status_code == 401


def test_get_owned_pet_forbids_cross_owner_access(make_user):
    """User B cannot access user A's pet; get_owned_pet raises FORBIDDEN."""
    import uuid as uuid_module
    from app.db import SessionLocal
    from app.domain.auth.models import User
    from app.domain.pets.service import get_owned_pet
    from app.errors import AppError

    a, b = make_user(), make_user()

    # A creates a pet
    resp = a["client"].post("/api/pets", json={"name": "ขาวมณี", "species": "cat"})
    pet_id = uuid_module.UUID(resp.json()["id"])

    # B tries to access it via service; should raise FORBIDDEN
    db = SessionLocal()
    try:
        user_b_obj = db.query(User).filter_by(email=b["email"]).first()
        try:
            get_owned_pet(db, pet_id, user_b_obj)
            assert False, "Expected AppError to be raised"
        except AppError as e:
            assert e.code == "FORBIDDEN"
    finally:
        db.close()


def test_get_owned_pet_not_found_for_random_uuid(make_user):
    """get_owned_pet raises NOT_FOUND for non-existent pet UUID."""
    import uuid
    from app.db import SessionLocal
    from app.domain.auth.models import User
    from app.domain.pets.service import get_owned_pet
    from app.errors import AppError

    u = make_user()

    # Try to access a random UUID
    db = SessionLocal()
    try:
        user_obj = db.query(User).filter_by(email=u["email"]).first()
        try:
            get_owned_pet(db, uuid.uuid4(), user_obj)
            assert False, "Expected AppError to be raised"
        except AppError as e:
            assert e.code == "NOT_FOUND"
    finally:
        db.close()
