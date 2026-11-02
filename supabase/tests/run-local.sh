#!/usr/bin/env bash
# 로컬 Postgres(16+)에 새 테스트 DB를 만들고 마이그레이션 적용 → Phase 1 검증 SQL 실행.
# 사용법: PGUSER=postgres PGHOST=localhost bash supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

DB="${TEST_DB:-booth_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/local_supabase_roles.sql
for f in supabase/migrations/*.sql; do
  echo "적용: $f"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

echo "시간대 생성(seed):"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -c "$(sed -n '/^select public.generate_slots(/,/^);/p' supabase/seed/generate_slots.sql)"

echo "검증 SQL 실행:"
out=$(psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/phase1_checks.sql -A -F ' | ' -t)
echo "$out"
total=$(echo "$out" | grep -c ' | ' || true)
failed=$(echo "$out" | awk -F ' \\| ' '$2 != "t"' | grep -c ' | ' || true)
echo "----"
echo "전체 ${total}개 / 실패 ${failed}개"
[ "$failed" -eq 0 ]
