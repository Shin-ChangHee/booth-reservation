-- 로컬 Postgres에서 Supabase 환경을 흉내 내기 위한 준비 스크립트.
-- ※ Supabase 프로젝트에는 실행하지 마세요. (run-local.sh 전용)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase 기본 권한 재현: public 스키마의 새 테이블·함수에 anon/authenticated 권한이 자동 부여됨
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
