-- =============================================================
-- 2. 내부 도우미 함수 (private 스키마, API 비노출, 외부 실행 권한 없음)
-- =============================================================

-- 4자리 확인코드: 헷갈리는 문자(0,O,1,I,L,B,8,S,5,Z,2 등)를 뺀 25개 문자
create or replace function private.random_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
           substr('ACDEFGHJKMNPQRTUVWXY34679', (get_byte(s.b, i) % 25) + 1, 1),
           '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) s,
       generate_series(0, 3) as i
$$;

-- 시간대의 유효 예약 수 (booked + checked_in)
create or replace function private.active_count(p_slot_id bigint)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from public.bookings
  where slot_id = p_slot_id
    and status in ('booked', 'checked_in')
$$;

-- 예약 1건 insert. 확인코드가 겹치면 최대 10회 재시도.
-- 호출하는 쪽에서 시간대 행 잠금과 정원 검사를 이미 끝낸 상태여야 한다.
create or replace function private.insert_booking(
  p_slot_id bigint,
  p_source public.booking_source,
  p_device_token text
)
returns public.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.bookings;
begin
  for i in 1..10 loop
    begin
      insert into public.bookings (slot_id, code, source, device_token)
      values (p_slot_id, private.random_code(), p_source, p_device_token)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- 코드 중복 → 다시 생성
      null;
    end;
  end loop;
  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

-- 관람객에게 돌려주는 예약 정보 (예약 id·기기 토큰은 포함하지 않음)
create or replace function private.visitor_booking_json(p_booking_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'code', b.code,
           'status', b.status,
           'starts_at', s.starts_at,
           'ends_at', s.ends_at)
  from public.bookings b
  join public.slots s on s.id = b.slot_id
  where b.id = p_booking_id
$$;

-- 스태프용 예약 정보
create or replace function private.admin_booking_json(p_booking_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'id', b.id,
           'slot_id', b.slot_id,
           'code', b.code,
           'status', b.status,
           'source', b.source,
           'created_at', b.created_at,
           'checked_in_at', b.checked_in_at,
           'cancelled_at', b.cancelled_at,
           'starts_at', s.starts_at,
           'ends_at', s.ends_at)
  from public.bookings b
  join public.slots s on s.id = b.slot_id
  where b.id = p_booking_id
$$;

-- 스태프 확인: 로그인한 사용자(authenticated) 또는 service_role만 통과.
-- Supabase 익명 로그인(is_anonymous)으로 받은 토큰은 거부한다.
create or replace function private.assert_staff()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if coalesce(v_claims ->> 'role', '') not in ('authenticated', 'service_role')
     or coalesce((v_claims ->> 'is_anonymous')::boolean, false) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
