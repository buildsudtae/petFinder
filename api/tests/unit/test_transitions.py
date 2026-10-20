import pytest

from app.domain.reports.service import next_status_on_reopen, validate_transition
from app.errors import AppError


def test_reopen_goes_to_has_lead_when_sightings_exist():
    assert next_status_on_reopen(has_sightings=True) == "HAS_LEAD"


def test_reopen_goes_to_searching_when_no_sightings():
    assert next_status_on_reopen(has_sightings=False) == "SEARCHING"


@pytest.mark.parametrize("current,target", [
    ("SEARCHING", "HAS_LEAD"),      # ระบบตั้งเองเท่านั้น ห้ามมาจาก API
    ("HAS_LEAD", "HAS_LEAD"),
    ("SEARCHING", "SEARCHING"),
    ("RESOLVED", "RESOLVED"),
])
def test_rejected_transitions(current, target):
    with pytest.raises(AppError) as e:
        validate_transition(current, target)
    assert e.value.code == "INVALID_TRANSITION"


@pytest.mark.parametrize("current", ["SEARCHING", "HAS_LEAD"])
def test_can_resolve_from_any_open_status(current):
    validate_transition(current, "RESOLVED")
