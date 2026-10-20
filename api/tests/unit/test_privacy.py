import importlib
import pkgutil
import re
import sys

from pydantic import BaseModel

# substring match, case-insensitive: catches phone_number, contact_info, line_id, user_email, ...
FORBIDDEN_RE = re.compile(r"phone|tel|mobile|line|address|email|contact|password", re.IGNORECASE)


def _all_response_models():
    import app.domain as domain
    found = []
    for mod in pkgutil.walk_packages(domain.__path__, prefix="app.domain."):
        module = importlib.import_module(mod.name)
        for obj in vars(module).values():
            if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
                found.append(obj)
    return found


def test_no_non_request_schema_exposes_contact_information():
    # every pydantic model under app.domain except request bodies (names ending in "In")
    offenders = [
        (m.__name__, f)
        for m in _all_response_models()
        if not m.__name__.endswith("In")
        for f in m.model_fields
        if FORBIDDEN_RE.search(f)
    ]
    assert offenders == [], f"schema เปิดเผยข้อมูลติดต่อ: {offenders}"


# the only contact-shaped columns allowed anywhere: login credentials on users
ALLOWED_COLUMNS = {("users", "email"), ("users", "password_hash")}


def test_no_table_has_contact_columns():
    import app.domain  # noqa: F401
    _all_response_models()                       # ensure every model module is imported
    from app.db import Base
    offenders = [
        (t.name, c.name)
        for t in Base.metadata.tables.values()
        for c in t.columns
        if FORBIDDEN_RE.search(c.name) and (t.name, c.name) not in ALLOWED_COLUMNS
    ]
    assert offenders == [], f"ตารางมีคอลัมน์ข้อมูลติดต่อ: {offenders}"


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
