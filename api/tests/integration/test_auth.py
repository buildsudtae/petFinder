def test_register_then_me_returns_profile_without_contact_fields(client, make_user):
    u = make_user(display_name="สมชาย")
    r = u["client"].get("/api/me")
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "สมชาย"
    for forbidden in ("phone", "address", "line_id", "password_hash"):
        assert forbidden not in body


def test_login_with_wrong_password_does_not_reveal_which_field(client, make_user):
    u = make_user()
    r = client.post("/api/auth/login", json={"email": u["email"], "password": "WrongPassword123"})
    assert r.status_code == 401
    assert r.json()["code"] == "AUTH_REQUIRED"
    assert r.json()["field"] is None
    assert "อีเมลหรือรหัสผ่านไม่ถูกต้อง" in r.json()["message_th"]


def test_protected_route_without_cookie_is_401(client):
    assert client.get("/api/me").status_code == 401


def test_session_cookie_is_httponly(client, make_user):
    u = make_user()
    cookie = [c for c in u["client"].cookies.jar if c.name == "pettech_session"][0]
    assert cookie.has_nonstandard_attr("HttpOnly")
