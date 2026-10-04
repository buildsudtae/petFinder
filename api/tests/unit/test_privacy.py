import importlib
import pkgutil
import sys

from pydantic import BaseModel

FORBIDDEN_FIELDS = {"phone", "mobile", "tel", "address", "line_id", "email", "password", "password_hash"}


def _all_response_models():
    import app.domain as domain
    found = []
    for mod in pkgutil.walk_packages(domain.__path__, prefix="app.domain."):
        module = importlib.import_module(mod.name)
        for obj in vars(module).values():
            if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
                found.append(obj)
    return found


def test_no_response_schema_exposes_contact_information():
    offenders = [
        (m.__name__, f)
        for m in _all_response_models()
        for f in m.model_fields
        if f.lower() in FORBIDDEN_FIELDS and m.__name__.endswith("Out")
    ]
    assert offenders == [], f"schema เปิดเผยข้อมูลติดต่อ: {offenders}"


def test_user_table_has_no_contact_columns():
    from app.domain.auth.models import User
    cols = {c.name.lower() for c in User.__table__.columns}
    assert cols & (FORBIDDEN_FIELDS - {"email", "password_hash"}) == set()


def test_privacy_walk_imports_every_domain_module_on_disk():
    """กันการ skip เงียบๆ: ทุกไฟล์ .py ใต้ app/domain ต้องถูก import โดย walk"""
    import app.domain as domain
    from pathlib import Path

    on_disk = set()
    root = Path(next(iter(domain.__path__)))
    for p in root.rglob("*.py"):
        rel = p.relative_to(root).with_suffix("")
        parts = rel.parts[:-1] if rel.name == "__init__" else rel.parts
        if parts:
            on_disk.add("app.domain." + ".".join(parts))
    _all_response_models()
    missing = {m for m in on_disk if m not in sys.modules}
    assert missing == set(), f"โมดูลที่ walk ไม่ได้ import: {missing}"
    assert "app.domain.relay.schemas" in on_disk


def test_walk_actually_finds_out_models_including_relay():
    names = {m.__name__ for m in _all_response_models()}
    assert "MessageOut" in names
