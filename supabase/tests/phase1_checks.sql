-- =============================================================
-- Phase 1 검증 SQL — 권한(RLS) · 예약 규칙 · 스태프 RPC · 시간대 생성
--
-- 실행: Supabase 대시보드 > SQL Editor에 전체를 붙여넣고 실행 (postgres 계정으로 실행됨)
--       또는 로컬:  psql -f supabase/tests/phase1_checks.sql
-- 결과: 마지막에 test_results 표가 나온다. passed 열이 모두 true여야 한다.
--
-- 테스트용 시간대(현재 시각 근처, 초 단위 17초 오프셋)와 2099-01-01 시간대를 만들었다가
-- 끝에서 모두 지우고, booking_open 값도 원래대로 되돌린다. 실제 행사 데이터는 건드리지 않는다.
-- (동시 접속 경쟁 테스트는 Phase 6의 scripts/load-test.ts에서 한다.)
-- =============================================================

drop table if exists pg_temp.test_results;
create temp table test_results (
  id serial,
  name text,
  passed boolean,
  detail text
);

do $test$
declare
  v_me        text := current_user;
  v_open_was  boolean;
  v_ended_was boolean;
  base        timestamptz := date_trunc('minute', now()) + interval '17 seconds';
  s_future    bigint;
  s_future2   bigint;
  s_started   bigint;
  s_small     bigint;
  s_closed    bigint;
  tok_a       text := 'phase1-test-device-aaaaaaaa';
  tok_b       text := 'phase1-test-device-bbbbbbbb';
  tok_c       text := 'phase1-test-device-cccccccc';
  code_a      text;
  code_b      text;
  r           jsonb;
  n           int;
  ok          boolean;
  err         text;
  v_bid       uuid;
begin
  select booking_open, booking_ended into v_open_was, v_ended_was from public.settings where id = 1;

  -- ---------- 준비: 테스트 시간대 ----------
  insert into public.slots (starts_at, ends_at, capacity) values (base + interval '1 hour',  base + interval '70 minutes',  3) returning id into s_future;
  insert into public.slots (starts_at, ends_at, capacity) values (base + interval '2 hours', base + interval '130 minutes', 3) returning id into s_future2;
  insert into public.slots (starts_at, ends_at, capacity) values (base - interval '5 minutes', base + interval '5 minutes', 3) returning id into s_started;
  insert into public.slots (starts_at, ends_at, capacity) values (base + interval '3 hours', base + interval '190 minutes', 1) returning id into s_small;
  insert into public.slots (starts_at, ends_at, capacity, is_closed) values (base + interval '4 hours', base + interval '250 minutes', 3, true) returning id into s_closed;

  -- =========================================================
  -- 1. 권한: anon
  -- =========================================================
  -- P1~P3: anon 테이블 직접 select → 거부 또는 0건
  foreach err in array array['bookings', 'slots', 'settings'] loop
    begin
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute format('select count(*) from public.%I', err) into n;
      perform set_config('role', v_me, true);
      insert into test_results (name, passed, detail) values ('P anon select ' || err || ' → 0건/거부', n = 0, n || '건');
    exception when others then
      perform set_config('role', v_me, true);
      insert into test_results (name, passed, detail) values ('P anon select ' || err || ' → 0건/거부', true, '거부: ' || sqlerrm);
    end;
  end loop;

  -- P4: anon insert
  begin
    perform set_config('role', 'anon', true);
    insert into public.bookings (slot_id, code) values (s_future, 'AAAA');
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P anon insert bookings → 거부', false, '삽입됨');
  exception when others then
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P anon insert bookings → 거부', true, sqlerrm);
  end;

  -- P5: anon update settings
  begin
    perform set_config('role', 'anon', true);
    update public.settings set booking_open = true;
    get diagnostics n = row_count;
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P anon update settings → 거부/0건', n = 0, n || '건');
  exception when others then
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P anon update settings → 거부/0건', true, sqlerrm);
  end;

  -- P6~P8: anon admin RPC / generate_slots / private 함수 호출 → 거부
  foreach err in array array[
    'select public.admin_list()',
    'select public.admin_set_booking_open(true)',
    'select public.admin_set_booking_ended(true)',
    'select public.admin_check_in(''AAAA'')',
    'select public.admin_walk_in(1, true)',
    'select public.admin_update_slot(1, 99, false)',
    'select public.admin_set_status(gen_random_uuid(), ''checked_in'')',
    'select public.generate_slots(date ''2099-01-01'', time ''10:00'', time ''11:00'', 10, 3, true)',
    'select private.random_code()'
  ] loop
    begin
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute err;
      perform set_config('role', v_me, true);
      insert into test_results (name, passed, detail) values ('P anon ' || err || ' → 거부', false, '실행됨');
    exception when others then
      perform set_config('role', v_me, true);
      insert into test_results (name, passed, detail) values ('P anon ' || err || ' → 거부', true, sqlerrm);
    end;
  end loop;

  -- P9: anon get_public_state 허용, 확인코드·예약 정보 미포함
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_public_state();
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values
    ('P anon get_public_state 허용 + 코드/토큰 미포함',
     r ? 'slots' and r::text not like '%"code"%' and r::text not like '%device%',
     left(r::text, 200));

  -- P10: 익명 로그인 토큰(authenticated + is_anonymous)으로 admin RPC → 거부
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true}', true);
    r := public.admin_list();
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P 익명 로그인 사용자 admin_list → 거부', false, '실행됨');
  exception when others then
    perform set_config('role', v_me, true);
    insert into test_results (name, passed, detail) values ('P 익명 로그인 사용자 admin_list → 거부', true, sqlerrm);
  end;

  -- P11: 스태프(authenticated) admin_list 허용
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  r := public.admin_list();
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('P 스태프 admin_list 허용', r ? 'slots', left(r::text, 120));

  -- =========================================================
  -- 2. 예약 규칙 (anon으로 실행)
  -- =========================================================
  update public.settings set booking_open = false where id = 1;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  r := public.book_slot(s_future, tok_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 접수 중지 상태 예약 → BOOKING_CLOSED', r ->> 'error' = 'BOOKING_CLOSED', r::text);

  update public.settings set booking_open = true where id = 1;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  r := public.book_slot(s_future, tok_a);
  code_a := r -> 'booking' ->> 'code';
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 예약 성공 + 4자리 코드', (r ->> 'ok')::boolean and code_a ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{4}$', r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_future2, tok_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 같은 기기 두 번째 예약 → ALREADY_BOOKED + 기존 예약 반환',
    r ->> 'error' = 'ALREADY_BOOKED' and r -> 'booking' ->> 'code' = code_a, r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_started, tok_b);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 시작된 시간대 → SLOT_STARTED', r ->> 'error' = 'SLOT_STARTED', r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_closed, tok_b);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 닫힌 시간대 → SLOT_UNAVAILABLE', r ->> 'error' = 'SLOT_UNAVAILABLE', r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(-1, tok_b);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 없는 시간대 → SLOT_UNAVAILABLE', r ->> 'error' = 'SLOT_UNAVAILABLE', r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_small, tok_b);
  code_b := r -> 'booking' ->> 'code';
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 정원 1 시간대 첫 예약 성공', (r ->> 'ok')::boolean, r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_small, tok_c);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 정원 찬 시간대 → SLOT_FULL', r ->> 'error' = 'SLOT_FULL', r::text);

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_future, 'short');
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 잘못된 기기 토큰 → INVALID_REQUEST', r ->> 'error' = 'INVALID_REQUEST', r::text);

  -- 남은 자리 확인
  perform set_config('role', 'anon', true);
  r := public.get_public_state();
  perform set_config('role', v_me, true);
  select (e ->> 'remaining')::int into n from jsonb_array_elements(r -> 'slots') e where (e ->> 'id')::bigint = s_future;
  insert into test_results (name, passed, detail) values ('B 예약 후 남은 자리 3 → 2', n = 2, coalesce(n::text, 'null'));
  insert into test_results (name, passed, detail) values ('B 닫힌 시간대는 공개 목록에서 숨김',
    not exists (select 1 from jsonb_array_elements(r -> 'slots') e where (e ->> 'id')::bigint = s_closed), '');

  -- 내 예약 조회
  perform set_config('role', 'anon', true);
  r := public.get_my_booking(tok_a, lower(code_a));
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B get_my_booking 토큰+코드 일치 → 반환', r ->> 'code' = code_a, coalesce(r::text, 'null'));

  perform set_config('role', 'anon', true);
  r := public.get_my_booking(tok_b, code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B get_my_booking 다른 기기 → null', r is null, coalesce(r::text, 'null'));

  -- 취소
  perform set_config('role', 'anon', true);
  r := public.cancel_my_booking(tok_b, code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 다른 기기로 취소 → NOT_FOUND', r ->> 'error' = 'NOT_FOUND', r::text);

  perform set_config('role', 'anon', true);
  r := public.cancel_my_booking(tok_a, code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 내 예약 취소 성공', (r ->> 'ok')::boolean and r -> 'booking' ->> 'status' = 'cancelled', r::text);

  perform set_config('role', 'anon', true);
  r := public.get_public_state();
  perform set_config('role', v_me, true);
  select (e ->> 'remaining')::int into n from jsonb_array_elements(r -> 'slots') e where (e ->> 'id')::bigint = s_future;
  insert into test_results (name, passed, detail) values ('B 취소 후 남은 자리 2 → 3', n = 3, coalesce(n::text, 'null'));

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_future2, tok_a);
  code_a := r -> 'booking' ->> 'code';
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('B 취소 후 같은 기기 재예약 가능', (r ->> 'ok')::boolean, r::text);

  -- =========================================================
  -- 3. 스태프 RPC (authenticated로 실행)
  -- =========================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);

  r := public.admin_check_in(' ' || lower(code_a) || ' ');
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 코드 입력 방문 처리 → CHECKED_IN', r ->> 'result' = 'CHECKED_IN', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_check_in(code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 같은 코드 다시 → ALREADY_CHECKED_IN', r ->> 'result' = 'ALREADY_CHECKED_IN', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_check_in('ZZZZ');
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 없는 코드 → NOT_FOUND', r ->> 'result' = 'NOT_FOUND', r::text);

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.cancel_my_booking(tok_a, code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 방문 완료된 예약은 관람객 취소 불가', r ->> 'error' = 'NOT_CANCELLABLE', r::text);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  r := public.admin_walk_in(s_small);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 정원 찬 시간대 현장 등록 → SLOT_FULL', r ->> 'error' = 'SLOT_FULL', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_walk_in(s_small, true);
  v_bid := (r -> 'booking' ->> 'id')::uuid;
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 강제 현장 등록(정원 초과 허용) + 출처 walk_in',
    (r ->> 'ok')::boolean and r -> 'booking' ->> 'source' = 'walk_in', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_walk_in(s_started);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 진행 중 시간대 현장 등록 허용', (r ->> 'ok')::boolean, r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_set_status(v_bid, 'cancelled');
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 상태 변경 → cancelled', r -> 'booking' ->> 'status' = 'cancelled', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_update_slot(s_small, 0, null);
  r := public.admin_set_status(v_bid, 'booked');
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 정원 찬 시간대로 취소 되살리기 → SLOT_FULL', r ->> 'error' = 'SLOT_FULL', r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_update_slot(s_future, null, true);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 시간대 닫기 (정원 유지)',
    (r -> 'slot' ->> 'is_closed')::boolean and (r -> 'slot' ->> 'capacity')::int = 3, r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_set_booking_open(false);
  perform set_config('role', v_me, true);
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_public_state();
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('A 접수 끄기 → 공개 상태 booking_open=false', not (r ->> 'booking_open')::boolean, left(r::text, 80));

  -- =========================================================
  -- 3-1. 예약 마감 (booking_ended)
  -- =========================================================
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  r := public.admin_set_booking_open(true);
  r := public.admin_set_booking_ended(true);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 예약 마감 → ended=true, 접수도 꺼짐',
    (select booking_ended and not booking_open from public.settings where id = 1), r::text);

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  r := public.get_public_state();
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 공개 상태에 booking_ended=true', (r ->> 'booking_ended')::boolean, left(r::text, 80));

  perform set_config('role', 'anon', true);
  r := public.book_slot(s_future2, tok_c);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 마감 상태 예약 → BOOKING_ENDED', r ->> 'error' = 'BOOKING_ENDED', r::text);

  perform set_config('role', 'anon', true);
  r := public.get_my_booking(tok_a, code_a);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 마감돼도 기존 예약 조회 가능', r ->> 'code' = code_a, coalesce(r::text, 'null'));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  r := public.admin_walk_in(s_future2);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 마감 중에도 현장 등록 가능', (r ->> 'ok')::boolean, r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_set_booking_open(true);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 접수 켜기 → 마감 해제',
    (select booking_open and not booking_ended from public.settings where id = 1), r::text);

  perform set_config('role', 'authenticated', true);
  r := public.admin_set_booking_ended(true);
  r := public.admin_set_booking_ended(false);
  perform set_config('role', v_me, true);
  insert into test_results (name, passed, detail) values ('E 마감 해제 → 접수 꺼짐 상태',
    (select not booking_open and not booking_ended from public.settings where id = 1), r::text);

  -- =========================================================
  -- 4. 시간대 생성 (postgres로 실행, 2099-01-01 사용)
  -- =========================================================
  r := public.generate_slots(date '2099-01-01', time '10:00', time '16:20', 10, 3, true);
  insert into test_results (name, passed, detail) values ('G 10:00–16:20 / 10분 → 38개 생성', (r ->> 'inserted')::int = 38 and (r ->> 'total_that_day')::int = 38, r::text);

  select count(*) into n from public.slots
  where starts_at = timestamptz '2099-01-01 10:00 Asia/Seoul' and ends_at = timestamptz '2099-01-01 10:10 Asia/Seoul';
  insert into test_results (name, passed, detail) values ('G 첫 시간대 10:00–10:10 KST', n = 1, n || '');
  select count(*) into n from public.slots
  where starts_at = timestamptz '2099-01-01 16:10 Asia/Seoul' and ends_at = timestamptz '2099-01-01 16:20 Asia/Seoul';
  insert into test_results (name, passed, detail) values ('G 마지막 시간대 16:10–16:20 KST', n = 1, n || '');

  -- 10:30 시간대에 예약 1건을 넣고 15분 간격으로 재생성 → 예약 있는 시간대 유지, 겹치는 새 시간대 생략
  perform private.insert_booking(
    (select id from public.slots where starts_at = timestamptz '2099-01-01 10:30 Asia/Seoul'), 'walk_in', null);
  r := public.generate_slots(date '2099-01-01', time '10:00', time '16:20', 15, 2, true);
  select count(*) into n from public.slots a join public.slots b on a.id < b.id
  where a.starts_at < b.ends_at and b.starts_at < a.ends_at
    and a.starts_at >= timestamptz '2099-01-01 00:00 Asia/Seoul';
  insert into test_results (name, passed, detail) values ('G 재생성: 예약 있는 시간대 유지 + 겹침 없음',
    (r ->> 'deleted')::int = 37 and (r ->> 'skipped_overlapping')::int = 1 and n = 0
    and exists (select 1 from public.slots where starts_at = timestamptz '2099-01-01 10:30 Asia/Seoul'),
    r::text);

  -- ---------- 정리 ----------
  delete from public.bookings where slot_id in (
    select id from public.slots
    where id in (s_future, s_future2, s_started, s_small, s_closed)
       or (starts_at >= timestamptz '2099-01-01 00:00 Asia/Seoul' and starts_at < timestamptz '2099-01-02 00:00 Asia/Seoul'));
  delete from public.slots
  where id in (s_future, s_future2, s_started, s_small, s_closed)
     or (starts_at >= timestamptz '2099-01-01 00:00 Asia/Seoul' and starts_at < timestamptz '2099-01-02 00:00 Asia/Seoul');
  update public.settings set booking_open = v_open_was, booking_ended = v_ended_was where id = 1;
end
$test$;

select id, passed, name, detail from test_results order by id;
