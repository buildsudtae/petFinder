#!/usr/bin/env bash
# smoke test: เส้นทางหลักของระบบที่ deploy แล้ว + กฎ 409 หลังปิดประกาศ
# ใช้: BASE_URL=http://localhost:8000 ./scripts/smoke.sh   (exit 0 = ผ่านทั้งหมด)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:8000}"
TMP=$(mktemp -d)
JAR_OWNER="$TMP/owner.jar" ; JAR_FINDER="$TMP/finder.jar"
trap 'rm -rf "$TMP"' EXIT
STAMP=$(date +%s)
PW='LongEnoughPassw0rd'

say()  { printf '  → %s\n' "$1"; }
fail() { printf '  ✗ %s\n' "$1" >&2; exit 1; }
api()  { curl -fsS "$@"; }
# JSON ส่งผ่าน stdin (ไม่ผ่าน argv) เพื่อให้ข้อความไทยเป็น UTF-8 ครบทุกแพลตฟอร์ม
# (บน Git Bash/Windows argv ถูกแปลง codepage แล้ว JSON พัง)
post_json() { local url=$1; shift; printf '%s' "$BODY" | api -X POST "$url" -H 'content-type: application/json' --data-binary @- "$@"; }
# จับ response ลงตัวแปรก่อนค่อย grep — grep -q ที่ปิด pipe ก่อนจบทำให้ curl โดน SIGPIPE
# และ pipefail ทำให้ผลไม่แน่นอน; และเมื่อ curl ล้มเหลวต้องหยุด ไม่ใช่ผ่านเงียบๆ
expect() { printf '%s' "$2" | grep -q "$1" || fail "$3"; }
id_of()  { sed -n 's/.*"id":"\([^"]*\)".*/\1/p'; }

# ฟิลด์ multipart ภาษาไทยอ่านจากไฟล์ (-F name=<file) ไม่ผ่าน argv
printf '%s' 'บางกะปิ'      > "$TMP/district"
printf '%s' 'เห็นแถวตลาด'  > "$TMP/note1"
printf '%s' 'มาช้า'        > "$TMP/note2"

say "health"
H=$(api "$BASE/api/health")
expect '"status":"ok"' "$H" "health ไม่ใช่ ok: $H"

say "สมัครและเข้าสู่ระบบ: เจ้าของ"
BODY="{\"email\":\"owner$STAMP@example.com\",\"password\":\"$PW\",\"display_name\":\"เจ้าของ\"}"
post_json "$BASE/api/auth/register" >/dev/null
BODY="{\"email\":\"owner$STAMP@example.com\",\"password\":\"$PW\"}"
post_json "$BASE/api/auth/login" -c "$JAR_OWNER" >/dev/null

say "สร้างสัตว์เลี้ยงและประกาศ"
BODY='{"name":"ขาวมณี","species":"cat"}'
PET=$(post_json "$BASE/api/pets" -b "$JAR_OWNER" | id_of)
[ -n "$PET" ] || fail "สร้างสัตว์เลี้ยงไม่ได้รับ id"
SEEN=$(date -u -d '-2 hours' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
BODY="{\"pet_id\":\"$PET\",\"last_seen_at\":\"$SEEN\",\"district\":\"บางกะปิ\"}"
REPORT=$(post_json "$BASE/api/reports" -b "$JAR_OWNER" | id_of)
[ -n "$REPORT" ] || fail "สร้างประกาศไม่ได้รับ id"

say "สมัครและเข้าสู่ระบบ: ผู้พบเห็น"
BODY="{\"email\":\"finder$STAMP@example.com\",\"password\":\"$PW\",\"display_name\":\"ผู้พบเห็น\"}"
post_json "$BASE/api/auth/register" >/dev/null
BODY="{\"email\":\"finder$STAMP@example.com\",\"password\":\"$PW\"}"
post_json "$BASE/api/auth/login" -c "$JAR_FINDER" >/dev/null

say "ส่งเบาะแส → สถานะต้องเป็น HAS_LEAD"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
api -b "$JAR_FINDER" -X POST "$BASE/api/reports/$REPORT/sightings" \
  -H "Idempotency-Key: smoke-$STAMP" \
  -F "seen_at=$NOW" -F "district=<$TMP/district" -F "note=<$TMP/note1" >/dev/null
R=$(api "$BASE/api/reports/$REPORT")
expect '"status":"HAS_LEAD"' "$R" "หลังมีเบาะแสสถานะต้องเป็น HAS_LEAD: $R"

say "ข้อมูลสาธารณะต้องไม่มีข้อมูลติดต่อ"
if printf '%s' "$R" | grep -Eq '"(phone|email|address|line_id)"'; then
  fail "response สาธารณะมีข้อมูลติดต่อรั่ว: $R"
fi

say "ประกาศที่ยังเปิดอยู่ต้องอยู่ในรายการตามหา (ตัวควบคุมเชิงบวกของขั้นตรวจหลังปิด)"
L=$(api "$BASE/api/reports")
grep -q "$REPORT" <<<"$L" || fail "ประกาศที่ยังเปิดอยู่ไม่อยู่ในรายการ — เช็ค 'ไม่อยู่ในรายการ' หลังปิดจะไม่มีความหมาย"

say "เจ้าของปิดประกาศ"
P=$(printf '%s' '{"to":"RESOLVED","reason":"เจอแล้ว"}' | api -b "$JAR_OWNER" -X PATCH \
  "$BASE/api/reports/$REPORT/status" -H 'content-type: application/json' --data-binary @-)
expect '"status":"RESOLVED"' "$P" "ปิดประกาศแล้วสถานะต้องเป็น RESOLVED: $P"

say "เบาะแสหลังปิดต้องได้ 409"
RESP=$(curl -s -w '
%{http_code}' -b "$JAR_FINDER" \
  -X POST "$BASE/api/reports/$REPORT/sightings" -H "Idempotency-Key: smoke-after-$STAMP" \
  -F "seen_at=$NOW" -F "district=<$TMP/district" -F "note=<$TMP/note2")
CODE=${RESP##*$'
'}; BODY409=${RESP%$'
'*}
[ "$CODE" = "409" ] || fail "คาดหวัง 409 แต่ได้ $CODE: $BODY409"
grep -q '"code":"REPORT_CLOSED"' <<<"$BODY409" || fail "409 แต่ code ไม่ใช่ REPORT_CLOSED: $BODY409"

say "ประกาศที่ปิดต้องไม่อยู่ในรายการตามหา"
L=$(api "$BASE/api/reports")
if grep -q "$REPORT" <<<"$L"; then fail "ประกาศที่ปิดยังโผล่ในรายการ"; fi

echo "smoke test ผ่านทั้งหมด"
