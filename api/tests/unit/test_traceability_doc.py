"""Guards docs/traceability.md: it may only cite Python tests that exist, and must cover every requirement.

Test names are collected by regex over the test files (not by a nested `pytest --collect-only`):
a nested run would re-import conftest (DB setup), recurse into this very file, and is slow. The
regex also sees api/tests/concurrency, which pytest would skip without BASE_URL.
Frontend tests (web/src/**/*.test.tsx) are cited in the doc by file path + quoted title, never as a
backticked `test_*` name, so this Python-only validator does not treat them as Python tests.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve()
# host: <repo>/api/tests/unit/this.py  -> repo = parents[3]
# test image (infra/Dockerfile.test): /srv/tests/unit/this.py -> api root = parents[2]
_ROOTS = [HERE.parents[3], HERE.parents[2]]

REQUIREMENTS = ["FR-01", "FR-02", "FR-03", "FR-04", "FR-05", "FR-06", "FR-07",
                "C1", "C2", "C3", "C4", "C5"]


def _doc_path() -> Path:
    for root in _ROOTS:
        p = root / "docs" / "traceability.md"
        if p.exists():
            return p
    raise AssertionError(f"docs/traceability.md not found under {[str(r) for r in _ROOTS]}")


def _collected_test_names() -> set[str]:
    dirs = [HERE.parents[1]]                       # api/tests (unit, integration, concurrency)
    dirs += [r / "worker" / "tests" for r in _ROOTS if (r / "worker" / "tests").is_dir()]
    names: set[str] = set()
    for d in dirs:
        for f in d.rglob("test_*.py"):
            names |= set(re.findall(r"^\s*(?:async\s+)?def (test_[A-Za-z0-9_]+)\(",
                                    f.read_text(encoding="utf-8"), re.M))
    return names


def _doc_text() -> str:
    return _doc_path().read_text(encoding="utf-8")


def test_every_cited_test_exists():
    cited = set(re.findall(r"`(test_[a-z0-9_]+)`", _doc_text()))
    assert cited, "traceability.md ต้องอ้างชื่อเทสด้วย backtick"
    missing = cited - _collected_test_names()
    assert missing == set(), f"เอกสารอ้างเทสที่ไม่มีจริง: {sorted(missing)}"


def test_all_requirements_are_covered():
    text = _doc_text()
    for req in REQUIREMENTS:
        assert re.search(rf"^\|\s*{req}\s*\|", text, re.M), f"ไม่มีแถวของ {req}"


def test_every_requirement_row_cites_evidence():
    rows = {m.group(1): m.group(0) for m in
            re.finditer(r"^\|\s*(FR-\d\d|C\d)\s*\|.*$", _doc_text(), re.M)}
    for req in REQUIREMENTS:
        assert re.search(r"`test_[a-z0-9_]+`|smoke\.sh", rows.get(req, "")), \
            f"แถว {req} ไม่อ้างเทสหรือขั้นตอน smoke ใดเลย"
