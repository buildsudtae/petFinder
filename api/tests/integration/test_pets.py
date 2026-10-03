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
