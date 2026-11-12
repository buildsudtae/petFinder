#!/usr/bin/env bash
# C5 บน stack ที่รันจริง: หยุด broker + worker → สร้างประกาศและส่งเบาะแสต้องยังได้
# → แจ้งเตือนค้างใน outbox → เปิด broker + worker กลับมา → แจ้งเตือนต้องถึงเจ้าของเอง
# ใช้: ./scripts/up.sh แล้ว ./scripts/degraded.sh   (exit 0 = ผ่าน · ทุกกรณีจะเปิด broker/worker คืนให้)
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${BASE_URL:-http://localhost:8000}"
DC="docker compose --env-file .env -f infra/docker-compose.yml"
TMP=$(mktemp -d)
JAR_OWNER="$TMP/owner.jar" ; JAR_FINDER="$TMP/finder.jar"
# ล้มกลางทางก็ต้องไม่ทิ้งระบบไว้ในสภาพ broker ดับ
trap '$DC start rabbitmq worker >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
STAMP=$(date +%s)
PW='LongEnoughPassw0rd'

say()  { printf '  → %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }
api()  { curl -fsS "$@"; }
post_json() { local url=$1; shift; printf '%s' "$BODY" | api -X POST "$url" -H 'content-type: application/json' --data-binary @- "$@"; }
id_of()  { sed -n 's/.*"id":"\([^"]*\)".*/\1/p'; }
unread() { api -b "$JAR_OWNER" "$BASE/api/notifications" | sed -n 's/.*"unread_count":\([0-9]*\).*/\1/p'; }
pending() { $DC exec -T db psql -U pettech -d pettech -tAc "select count(*) from outbox where published_at is null" </dev/null | tr -d '[:space:]'; }
printf '%s' 'บางกะปิ' > "$TMP/district"

[ -f .env ] || { echo "ไม่พบ .env — คัดลอกจาก .env.example ก่อน"; exit 1; }
api "$BASE/api/health" 2>/dev/null | grep -q '"status":"ok"' || { echo "ระบบยังไม่ขึ้น: รัน scripts/up.sh ก่อน"; exit 1; }

say "หยุด rabbitmq และ worker"
$DC stop rabbitmq worker >/dev/null

say "สมัคร เจ้าของ + ผู้พบเห็น (ไม่ต้องพึ่ง broker)"
for who in owner finder; do
  BODY="{\"email\":\"$who-c5-$STAMP@example.com\",\"password\":\"$PW\",\"display_name\":\"$who\"}"
  post_json "$BASE/api/auth/register" >/dev/null
  BODY="{\"email\":\"$who-c5-$STAMP@example.com\",\"password\":\"$PW\"}"
  jar=$JAR_OWNER; [ "$who" = finder ] && jar=$JAR_FINDER
  post_json "$BASE/api/auth/login" -c "$jar" >/dev/null
done

say "สร้างประกาศขณะ broker ดับ → ต้องได้ 201"
BODY='{"name":"ทดสอบC5","species":"dog"}'
PET=$(post_json "$BASE/api/pets" -b "$JAR_OWNER" | id_of)
SEEN=$(date -u -d '-1 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
BODY="{\"pet_id\":\"$PET\",\"last_seen_at\":\"$SEEN\",\"district\":\"บางกะปิ\"}"
REPORT=$(post_json "$BASE/api/reports" -b "$JAR_OWNER" | id_of)
[ -n "$REPORT" ] || fail "สร้างประกาศไม่ได้ขณะ broker ดับ"

say "ส่งเบาะแสขณะ broker ดับ → ต้องได้ 201 และสถานะเป็น HAS_LEAD"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR_FINDER" -X POST "$BASE/api/reports/$REPORT/sightings" \
  -H "Idempotency-Key: c5-$STAMP" -F "seen_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" -F "district=<$TMP/district")
[ "$CODE" = "201" ] || fail "ส่งเบาะแสขณะ broker ดับได้ $CODE (ต้องเป็น 201)"
api "$BASE/api/reports/$REPORT" | grep -q '"status":"HAS_LEAD"' || fail "สถานะไม่เปลี่ยนเป็น HAS_LEAD"

say "แจ้งเตือนต้องค้างใน outbox และเจ้าของยังไม่ได้รับ"
P=$(pending); [ "${P:-0}" -ge 1 ] || fail "ไม่มีแถวค้างใน outbox (ได้ '$P')"
[ "$(unread)" = "0" ] || fail "เจ้าของได้แจ้งเตือนทั้งที่ broker ดับ — ไม่ได้ทดสอบ C5 จริง"
printf '     outbox ค้าง %s แถว · แจ้งเตือนที่เจ้าของเห็น 0\n' "$P"

say "เปิด rabbitmq และ worker กลับมา → รอแจ้งเตือนถึงเจ้าของ (สูงสุด 120 วินาที)"
$DC start rabbitmq worker >/dev/null
for i in $(seq 1 60); do
  N=$(unread || echo 0)
  if [ "${N:-0}" -ge 1 ]; then
    printf '     แจ้งเตือนถึงเจ้าของหลังเปิดคืน ~%s วินาที · outbox ค้าง %s แถว\n' "$((i * 2))" "$(pending)"
    echo "C5 degraded mode ผ่าน"
    exit 0
  fi
  sleep 2
done
fail "เปิด broker คืนแล้ว 120 วินาที แจ้งเตือนยังไม่ถึงเจ้าของ"
