#!/usr/bin/env bash
# ใส่ข้อมูลตัวอย่างสำหรับดูหน้าเว็บ: บัญชี demo + สัตว์เลี้ยง 2 ตัว + ประกาศ 2 รายการ
# ใช้: ./scripts/seed.sh   (รันซ้ำได้ — บัญชีเดิมจะล็อกอินแทนสมัครใหม่ แต่ประกาศจะเพิ่มอีกชุด)
set -euo pipefail
BASE="${BASE_URL:-http://localhost:8000}"
JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
EMAIL='demo@example.com'; PW='LongEnoughPassw0rd'

# JSON ผ่าน stdin เพื่อให้ภาษาไทยเป็น UTF-8 ครบ (ดูเหตุผลใน smoke.sh)
post_json() { local url=$1; shift; printf '%s' "$BODY" | curl -fsS -X POST "$url" -H 'content-type: application/json' --data-binary @- "$@"; }
id_of() { sed -n 's/.*"id":"\([^"]*\)".*/\1/p'; }

BODY="{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"display_name\":\"บัญชีตัวอย่าง\"}"
post_json "$BASE/api/auth/register" >/dev/null 2>&1 || echo "  (บัญชี $EMAIL มีอยู่แล้ว — ล็อกอินแทน)"
BODY="{\"email\":\"$EMAIL\",\"password\":\"$PW\"}"
post_json "$BASE/api/auth/login" -c "$JAR" >/dev/null

seed_one() { # name species district hours_ago
  BODY="{\"name\":\"$1\",\"species\":\"$2\"}"
  local pet; pet=$(post_json "$BASE/api/pets" -b "$JAR" | id_of)
  local seen; seen=$(date -u -d "-$4 hours" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"$4"H +%Y-%m-%dT%H:%M:%SZ)
  BODY="{\"pet_id\":\"$pet\",\"last_seen_at\":\"$seen\",\"district\":\"$3\"}"
  post_json "$BASE/api/reports" -b "$JAR" >/dev/null
  echo "  + ประกาศตามหา $1 ($3)"
}
seed_one 'ขาวมณี' cat 'บางกะปิ' 3
seed_one 'ถุงเงิน' dog 'ลาดพร้าว' 8
echo "เสร็จ — เข้าสู่ระบบด้วย $EMAIL (รหัสผ่านอยู่ในสคริปต์นี้ ใช้เฉพาะข้อมูลตัวอย่าง)"
