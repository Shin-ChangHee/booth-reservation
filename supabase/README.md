# Supabase 적용 방법

## 1. 마이그레이션 적용 (최초 1회)
Supabase 대시보드 → **SQL Editor** → New query 에서 아래 파일을 **순서대로** 하나씩 붙여넣고 실행합니다.

1. `migrations/20261102000001_schema.sql` — 테이블, enum, RLS
2. `migrations/20261102000002_helpers.sql` — 내부 도우미 함수 (`private` 스키마)
3. `migrations/20261102000003_public_rpc.sql` — 관람객용 RPC
4. `migrations/20261102000004_admin_rpc.sql` — 스태프용 RPC
5. `migrations/20261102000005_generate_slots.sql` — 시간대 생성 함수

Supabase CLI를 쓴다면 `supabase link` 후 `supabase db push`로 한 번에 적용해도 됩니다.

## 2. 시간대 생성
`seed/generate_slots.sql`의 숫자(시작·종료 시각, 간격, 정원)를 확인하고 SQL Editor에서 실행합니다.
값이 바뀌면 고쳐서 다시 실행하면 됩니다. 예약이 있는 시간대는 지워지지 않습니다.

## 3. 검증
- SQL Editor에서 `tests/phase1_checks.sql` 전체 실행 → 결과 표의 `passed`가 모두 `true`
  (테스트 데이터는 스스로 지우고, 접수 on/off 값도 원래대로 되돌립니다)
- 로컬 터미널에서 `.env` 작성 후 `npm run verify:anon` → anon 키로 테이블 직접 조회·admin RPC가 거부되는지 확인

## 4. Auth 설정 (중요)
스태프 RPC는 "로그인한 사용자"면 누구나 실행할 수 있으므로, 아무나 가입하지 못하게 막아야 합니다.

- Authentication → Sign In / Providers → **Allow new users to sign up: 끄기**
- **Allow anonymous sign-ins: 끄기** (켜져 있어도 함수에서 거부하지만 꺼 두는 것이 안전)
- Authentication → Users → **Add user**로 스태프 공용 계정 1개 생성 (Auto Confirm 체크)

## 로컬 테스트 (개발용)
로컬 Postgres 16 이상이 있으면 `npm run test:db:local`로 새 DB에 마이그레이션을 적용하고 검증 SQL을 실행합니다.
`tests/local_supabase_roles.sql`은 로컬에서 Supabase 역할을 흉내 내는 파일이므로 Supabase에는 실행하지 마세요.
