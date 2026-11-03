/**
 * supabase/migrations/*.sql + 시간대 생성(seed)을 SQL Editor에 한 번에 붙여넣을 수 있는
 * supabase/setup_all.sql 하나로 합친다.   npm run db:bundle
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'supabase')
const migrations = readdirSync(resolve(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
const seed = readFileSync(resolve(root, 'seed', 'generate_slots.sql'), 'utf8')
// seed에서 generate_slots 호출 부분만 (확인용 select·주석 예시는 제외)
const seedCall = seed.match(/select public\.generate_slots\([\s\S]*?\n\);/)?.[0]
if (!seedCall) throw new Error('seed에서 generate_slots 호출을 찾지 못했어요')

const parts = [
  `-- =============================================================
-- 부스 예약 시스템 — Supabase 최초 설정 (한 번에 실행)
--
-- 사용법: 이 파일 내용 전체를 복사 → Supabase SQL Editor에 붙여넣기 → Run
--   · 테이블·권한·RPC 함수를 만들고, 2026-11-17 시간대를 생성합니다.
--   · 하나의 트랜잭션이라 중간에 오류가 나면 아무것도 적용되지 않습니다.
--   · 이미 적용한 프로젝트에 다시 실행하면 "already exists" 오류가 납니다 (정상).
--
-- 이 파일은 npm run db:bundle 로 자동 생성됩니다. 직접 고치지 말고 migrations/ 를 고치세요.
-- =============================================================

begin;
`,
  ...migrations.map((f) => `\n-- >>>>> migrations/${f}\n${readFileSync(resolve(root, 'migrations', f), 'utf8').trim()}\n`),
  `\n-- >>>>> seed/generate_slots.sql (시간대 생성 — 값은 seed 파일 기준)\n${seedCall}\n`,
  `\ncommit;\n\n-- 확인: 시간대 개수\nselect count(*) as 생성된_시간대 from public.slots;\n`,
]
writeFileSync(resolve(root, 'setup_all.sql'), parts.join(''))
console.log(`supabase/setup_all.sql 생성 (${migrations.length}개 마이그레이션 + 시간대 생성)`)
