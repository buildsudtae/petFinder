import pytest

from app import main
from app.config import DEFAULT_JWT_SECRET, Settings


def _patch(monkeypatch, secret):
    monkeypatch.setattr(main, "get_settings", lambda: Settings(jwt_secret=secret))


def test_guard_raises_on_default_secret(monkeypatch):
    monkeypatch.delenv("PETTECH_ALLOW_DEV_SECRET", raising=False)
    _patch(monkeypatch, DEFAULT_JWT_SECRET)
    with pytest.raises(RuntimeError):
        main.assert_safe_secret()


def test_guard_allows_default_with_escape_hatch(monkeypatch):
    monkeypatch.setenv("PETTECH_ALLOW_DEV_SECRET", "1")
    _patch(monkeypatch, DEFAULT_JWT_SECRET)
    main.assert_safe_secret()


def test_guard_passes_with_real_secret(monkeypatch):
    monkeypatch.delenv("PETTECH_ALLOW_DEV_SECRET", raising=False)
    _patch(monkeypatch, "a-real-secret")
    main.assert_safe_secret()


def test_startup_runs_guard(monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.delenv("PETTECH_ALLOW_DEV_SECRET", raising=False)
    _patch(monkeypatch, DEFAULT_JWT_SECRET)
    with pytest.raises(RuntimeError):
        with TestClient(main.app):
            pass


def test_guard_rejects_env_example_placeholder(monkeypatch):
    from app.config import PLACEHOLDER_JWT_SECRET

    monkeypatch.delenv("PETTECH_ALLOW_DEV_SECRET", raising=False)
    _patch(monkeypatch, PLACEHOLDER_JWT_SECRET)
    with pytest.raises(RuntimeError, match="placeholder"):
        main.assert_safe_secret()


def test_placeholder_is_rejected_even_with_escape_hatch(monkeypatch):
    from app.config import PLACEHOLDER_JWT_SECRET

    monkeypatch.setenv("PETTECH_ALLOW_DEV_SECRET", "1")
    _patch(monkeypatch, PLACEHOLDER_JWT_SECRET)
    with pytest.raises(RuntimeError):
        main.assert_safe_secret()


def test_placeholder_matches_env_example():
    import pathlib

    from app.config import PLACEHOLDER_JWT_SECRET

    example = pathlib.Path(__file__).resolve().parents[3] / ".env.example"
    if example.exists():  # not baked into the test image; checked when run from the repo
        assert f"JWT_SECRET={PLACEHOLDER_JWT_SECRET}" in example.read_text()
