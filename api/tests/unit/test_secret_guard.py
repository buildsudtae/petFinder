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
