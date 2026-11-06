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


# --- รูปสัตว์เลี้ยง --------------------------------------------------------------

def _jpeg() -> bytes:
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (16, 12), "orange").save(buf, "JPEG")
    return buf.getvalue()


def _put_photo(user, pet_id, data=None, name="kokoa.jpg", content_type="image/jpeg"):
    return user["client"].put(f"/api/pets/{pet_id}/photo",
                              files={"photo": (name, data if data is not None else _jpeg(), content_type)})


def _files(path):
    return sorted(p.name for p in path.iterdir())


def test_owner_sets_pet_photo_and_it_is_served(make_user, client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    owner = make_user()
    pet = owner["client"].post("/api/pets", json={"name": "โกโก้", "species": "dog"}).json()
    assert pet["photo_url"] is None
    r = _put_photo(owner, pet["id"])
    assert r.status_code == 200, r.text
    url = r.json()["photo_url"]
    assert url and url.startswith("/api/uploads/")
    assert client.get(url).status_code == 200
    assert owner["client"].get("/api/pets").json()["items"][0]["photo_url"] == url


def test_other_user_cannot_set_pet_photo_and_no_file_is_left(make_user, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    owner, stranger = make_user(), make_user()
    pet = owner["client"].post("/api/pets", json={"name": "โกโก้", "species": "dog"}).json()
    r = _put_photo(stranger, pet["id"])
    assert r.status_code == 403
    assert r.json()["code"] == "FORBIDDEN"
    assert _files(tmp_path) == []


def test_pet_photo_must_be_an_image(make_user, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    owner = make_user()
    pet = owner["client"].post("/api/pets", json={"name": "โกโก้", "species": "dog"}).json()
    r = _put_photo(owner, pet["id"], data=b"#!/bin/sh\nrm -rf /", name="x.sh", content_type="application/x-sh")
    assert r.status_code == 422
    assert r.json()["field"] == "photo"
    assert _files(tmp_path) == []


def test_replacing_pet_photo_removes_the_old_file(make_user, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    owner = make_user()
    pet = owner["client"].post("/api/pets", json={"name": "โกโก้", "species": "dog"}).json()
    first = _put_photo(owner, pet["id"]).json()["photo_url"].rsplit("/", 1)[1]
    second = _put_photo(owner, pet["id"]).json()["photo_url"].rsplit("/", 1)[1]
    assert first != second
    assert _files(tmp_path) == [second]


def test_pet_photo_on_unknown_pet_is_404(make_user):
    import uuid
    assert _put_photo(make_user(), str(uuid.uuid4())).status_code == 404


def test_report_detail_and_list_carry_pet_photo(open_report, client):
    pet_id = open_report["client"].get("/api/pets").json()["items"][0]["id"]
    url = _put_photo(open_report, pet_id).json()["photo_url"]
    assert client.get(f"/api/reports/{open_report['id']}").json()["photo_url"] == url
    assert client.get("/api/reports").json()["items"][0]["photo_url"] == url
