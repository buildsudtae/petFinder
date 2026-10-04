import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import httpx
import pytest

BASE = os.environ.get("BASE_URL", "http://traefik")
PNG = bytes.fromhex("89504e470d0a1a0a") + b"\x00" * 64

pytestmark = pytest.mark.skipif(not os.environ.get("BASE_URL"), reason="ต้องรันกับระบบที่ขึ้นอยู่แล้ว")


def _register(name: str) -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=20)
    email = f"{name}{uuid.uuid4().hex[:8]}@example.com"
    c.post("/api/auth/register", json={"email": email, "password": "LongEnoughPassw0rd",
                                       "display_name": name}).raise_for_status()
    c.post("/api/auth/login", json={"email": email, "password": "LongEnoughPassw0rd"}).raise_for_status()
    return c


def _open_report(owner: httpx.Client) -> str:
    pet = owner.post("/api/pets", json={"name": "ขาวมณี", "species": "cat"}).json()
    r = owner.post("/api/reports", json={
        "pet_id": pet["id"],
        "last_seen_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "district": "บางกะปิ"})
    r.raise_for_status()
    return r.json()["id"]


def _send_sighting(client: httpx.Client, rid: str, idem: str) -> int:
    return client.post(
        f"/api/reports/{rid}/sightings",
        data={"seen_at": (datetime.now(UTC) - timedelta(minutes=5)).isoformat(),
              "district": "บางกะปิ", "note": "เห็นแถวนี้"},
        files={"photo": ("a.png", PNG, "image/png")},
        headers={"Idempotency-Key": idem},
    ).status_code


def test_closing_while_sighting_arrives_never_leaves_sighting_in_closed_report():
    owner = _register("owner")
    for attempt in range(20):
        rid = _open_report(owner)
        finder = _register("finder")

        with ThreadPoolExecutor(max_workers=2) as pool:
            close = pool.submit(owner.patch, f"/api/reports/{rid}/status",
                                json={"to": "RESOLVED", "reason": "เจอแล้ว"})
            send = pool.submit(_send_sighting, finder, rid, f"race-{attempt}")
            close_status = close.result().status_code
            send_status = send.result()

        assert send_status in (201, 200, 409), f"สถานะที่ไม่คาดคิด: {send_status}"
        assert close_status == 200

        detail = httpx.get(f"{BASE}/api/reports/{rid}").json()
        timeline = httpx.get(f"{BASE}/api/reports/{rid}/sightings").json()["items"]
        # Added beyond the brief: the brief's assertions alone pass even with the lock removed
        # (RESOLVED + 201 + one sighting looks identical to "sighting first, then close").
        # What a broken lock DOES leave behind is an incoherent history: the stale sighting
        # transaction flips the report back to HAS_LEAD after the owner already got 200, and
        # the event chain no longer links (each event must start where the previous ended).
        assert detail["status"] == "RESOLVED", f"เจ้าของปิดสำเร็จแล้วแต่สถานะคือ {detail['status']}"
        events = httpx.get(f"{BASE}/api/reports/{rid}/events").json()["items"]
        prev = None
        for e in events:
            if prev is not None:
                assert e["from_status"] == prev, f"ประวัติสถานะขาดตอน: {events}"
            prev = e["to_status"]
        if detail["status"] == "RESOLVED" and send_status == 409:
            assert timeline == []            # ปิดชนะ: ห้ามมีเบาะแสค้างในประกาศที่ปิด
        if send_status in (200, 201):
            assert len(timeline) == 1        # เบาะแสชนะ: ต้องมีหนึ่งรายการ ไม่ซ้ำ


def test_ten_parallel_identical_sightings_create_exactly_one_row():
    owner = _register("owner")
    rid = _open_report(owner)
    finder = _register("finder")
    key = f"same-{uuid.uuid4().hex[:6]}"

    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(lambda _: _send_sighting(finder, rid, key), range(10)))

    assert sorted(set(codes)) in ([200, 201], [201]), codes
    assert codes.count(201) == 1, f"สร้างซ้ำ {codes.count(201)} ครั้ง"
    assert len(httpx.get(f"{BASE}/api/reports/{rid}/sightings").json()["items"]) == 1


def test_requests_actually_reached_both_api_replicas():
    """ถ้าทุกคำขอไปที่ replica เดียว เทส race ด้านบนจะอ่อนลงมาก — เช็คว่า LB กระจายจริง"""
    hostnames = set()
    with httpx.Client(base_url=BASE, timeout=10) as c:
        for _ in range(30):
            hostnames.add(c.get("/api/health").headers.get("x-served-by", ""))
    assert "" not in hostnames, f"บางคำขอไม่มี x-served-by: {hostnames}"
    assert len(hostnames) >= 2, f"คำขอไปที่ replica เดียว: {hostnames}"
