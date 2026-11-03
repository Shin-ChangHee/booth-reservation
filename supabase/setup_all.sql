-- =============================================================
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

-- >>>>> migrations/20261102000001_schema.sql
-- =============================================================
-- 1. 테이블 · enum · RLS
-- 관람객(anon)은 테이블에 직접 접근하지 못한다. 모든 읽기·쓰기는 RPC 함수로만 한다.
-- 개인정보 컬럼, 메모 컬럼은 만들지 않는다.
-- =============================================================

-- 내부 도우미 함수용 스키마 (PostgREST API에 노출되지 않음)
create schema if not exists private;
revoke all on schema private from public;

-- 전역 설정 (단일 행)
create table public.settings (
  id int primary key default 1 check (id = 1),
  booking_open boolean not null default false,
  booth_title text not null default 'AI 체형 정렬·근골격계 위험도 분석',
  notice text,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- 체험 시간대
create table public.slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  capacity int not null check (capacity >= 0),
  is_closed boolean not null default false,
  check (ends_at > starts_at)
);

-- 예약
create type public.booking_status as enum ('booked', 'checked_in', 'cancelled');
create type public.booking_source as enum ('qr', 'walk_in');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id bigint not null references public.slots(id),
  code text not null unique,            -- 4자리 확인코드
  status public.booking_status not null default 'booked',
  source public.booking_source not null default 'qr',
  device_token text,                    -- 관람객 기기 식별용 무작위 값 (개인정보 아님)
  created_at timestamptz not null default now(),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  check (code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{4}$')
);
create index on public.bookings (slot_id);
create index on public.bookings (device_token);

-- RLS: 켜기만 하고 정책은 하나도 만들지 않는다 → anon/authenticated 모두 직접 접근 0건.
alter table public.settings enable row level security;
alter table public.slots    enable row level security;
alter table public.bookings enable row level security;

-- Supabase는 public 스키마의 새 테이블에 anon/authenticated 권한을 기본으로 준다.
-- RLS와 별개로 테이블 권한 자체도 회수해 이중으로 막는다.
revoke all on table public.settings, public.slots, public.bookings from public, anon, authenticated;

-- >>>>> migrations/20261102000002_helpers.sql
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

-- >>>>> migrations/20261102000003_public_rpc.sql
-- =============================================================
-- 3. 관람객용 RPC (anon 허용)
-- 모든 함수는 security definer + search_path 고정.
-- 결과는 jsonb: 성공 {"ok": true, ...} / 실패 {"ok": false, "error": "코드"}
-- =============================================================

-- 6.1 공개 상태: 설정 + 끝나지 않고 닫히지 않은 시간대와 남은 자리.
-- 확인코드나 예약 목록은 절대 반환하지 않는다.
create or replace function public.get_public_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'now', now(),
    'booking_open', st.booking_open,
    'booth_title', st.booth_title,
    'notice', st.notice,
    'slots', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', sl.id,
                 'starts_at', sl.starts_at,
                 'ends_at', sl.ends_at,
                 'remaining', greatest(sl.capacity - private.active_count(sl.id), 0))
               order by sl.starts_at)
      from public.slots sl
      where sl.ends_at > now()
        and not sl.is_closed
    ), '[]'::jsonb))
  from public.settings st
  where st.id = 1
$$;

-- 6.2 예약하기. 한 트랜잭션(함수 1회 호출) 안에서 잠금 → 검사 → insert.
create or replace function public.book_slot(p_slot_id bigint, p_device_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_slot public.slots;
  v_existing uuid;
  v_new public.bookings;
begin
  if p_slot_id is null
     or p_device_token is null
     or length(p_device_token) not between 16 and 128 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  -- 1. 접수 중인가
  select booking_open into v_open from public.settings where id = 1;
  if not coalesce(v_open, false) then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_CLOSED');
  end if;

  -- 같은 기기에서 동시에 여러 시간대를 누르는 경우를 직렬화 (기기당 1건 보장)
  perform pg_advisory_xact_lock(hashtextextended('booth-device:' || p_device_token, 0));

  -- 2. 시간대 행 잠금 (같은 시간대 예약은 여기서 한 줄로 선다)
  select * into v_slot from public.slots where id = p_slot_id for update;

  -- 3. 시간대 상태
  if not found or v_slot.is_closed then
    return jsonb_build_object('ok', false, 'error', 'SLOT_UNAVAILABLE');
  end if;
  if v_slot.starts_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'SLOT_STARTED');
  end if;

  -- 4. 같은 기기의 유효 예약 (끝나지 않은 시간대)
  select b.id into v_existing
  from public.bookings b
  join public.slots s on s.id = b.slot_id
  where b.device_token = p_device_token
    and b.status in ('booked', 'checked_in')
    and s.ends_at > now()
  order by s.starts_at
  limit 1;
  if v_existing is not null then
    return jsonb_build_object(
      'ok', false,
      'error', 'ALREADY_BOOKED',
      'booking', private.visitor_booking_json(v_existing));
  end if;

  -- 5. 정원
  if private.active_count(v_slot.id) >= v_slot.capacity then
    return jsonb_build_object('ok', false, 'error', 'SLOT_FULL');
  end if;

  -- 6. 확인코드 생성 + insert
  v_new := private.insert_booking(v_slot.id, 'qr', p_device_token);
  return jsonb_build_object('ok', true, 'booking', private.visitor_booking_json(v_new.id));
end;
$$;

-- 6.3 내 예약 조회: device_token과 확인코드가 모두 일치해야 한다. 없으면 null.
create or replace function public.get_my_booking(p_device_token text, p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.visitor_booking_json(b.id)
  from public.bookings b
  where p_device_token is not null
    and b.device_token = p_device_token
    and b.code = upper(btrim(p_code))
$$;

-- 6.4 내 예약 취소: 두 값이 일치하고 status = 'booked'일 때만.
create or replace function public.cancel_my_booking(p_device_token text, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.booking_status;
begin
  if p_device_token is null or p_code is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select id, status into v_id, v_status
  from public.bookings
  where device_token = p_device_token
    and code = upper(btrim(p_code))
  for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_status <> 'booked' then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', v_status);
  end if;

  update public.bookings
  set status = 'cancelled', cancelled_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true, 'booking', private.visitor_booking_json(v_id));
end;
$$;

-- 권한: Supabase는 새 함수에 PUBLIC 실행 권한을 기본으로 준다 → 회수 후 필요한 역할에만 부여
revoke all on function public.get_public_state()                from public, anon, authenticated;
revoke all on function public.book_slot(bigint, text)           from public, anon, authenticated;
revoke all on function public.get_my_booking(text, text)        from public, anon, authenticated;
revoke all on function public.cancel_my_booking(text, text)     from public, anon, authenticated;

grant execute on function public.get_public_state()            to anon, authenticated;
grant execute on function public.book_slot(bigint, text)       to anon, authenticated;
grant execute on function public.get_my_booking(text, text)    to anon, authenticated;
grant execute on function public.cancel_my_booking(text, text) to anon, authenticated;

-- >>>>> migrations/20261102000004_admin_rpc.sql
-- =============================================================
-- 4. 스태프용 RPC (authenticated만 허용)
-- 실행 권한(grant)과 함수 안의 private.assert_staff() 로 이중 확인한다.
-- =============================================================

-- 전체 시간대 + 예약 목록 + 집계
create or replace function public.admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_staff();

  return (
    select jsonb_build_object(
      'now', now(),
      'settings', jsonb_build_object(
        'booking_open', st.booking_open,
        'booth_title', st.booth_title,
        'notice', st.notice,
        'updated_at', st.updated_at),
      'slots', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', sl.id,
                   'starts_at', sl.starts_at,
                   'ends_at', sl.ends_at,
                   'capacity', sl.capacity,
                   'is_closed', sl.is_closed,
                   'booked_count',     (select count(*) from public.bookings b where b.slot_id = sl.id and b.status = 'booked'),
                   'checked_in_count', (select count(*) from public.bookings b where b.slot_id = sl.id and b.status = 'checked_in'),
                   'cancelled_count',  (select count(*) from public.bookings b where b.slot_id = sl.id and b.status = 'cancelled'),
                   'walk_in_count',    (select count(*) from public.bookings b where b.slot_id = sl.id and b.source = 'walk_in' and b.status <> 'cancelled'),
                   'active_count',     private.active_count(sl.id),
                   'bookings', coalesce((
                     select jsonb_agg(
                              jsonb_build_object(
                                'id', b.id,
                                'code', b.code,
                                'status', b.status,
                                'source', b.source,
                                'created_at', b.created_at,
                                'checked_in_at', b.checked_in_at,
                                'cancelled_at', b.cancelled_at)
                              order by b.created_at)
                     from public.bookings b
                     where b.slot_id = sl.id
                   ), '[]'::jsonb))
                 order by sl.starts_at)
        from public.slots sl
      ), '[]'::jsonb))
    from public.settings st
    where st.id = 1
  );
end;
$$;

-- 코드로 방문 처리. 이미 방문/취소된 코드면 그 사실을 반환한다.
-- result: CHECKED_IN | ALREADY_CHECKED_IN | CANCELLED | NOT_FOUND
create or replace function public.admin_check_in(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.booking_status;
begin
  perform private.assert_staff();

  select id, status into v_id, v_status
  from public.bookings
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'result', 'NOT_FOUND');
  end if;

  if v_status = 'checked_in' then
    return jsonb_build_object('ok', false, 'result', 'ALREADY_CHECKED_IN',
                              'booking', private.admin_booking_json(v_id));
  end if;

  if v_status = 'cancelled' then
    return jsonb_build_object('ok', false, 'result', 'CANCELLED',
                              'booking', private.admin_booking_json(v_id));
  end if;

  update public.bookings
  set status = 'checked_in', checked_in_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true, 'result', 'CHECKED_IN',
                            'booking', private.admin_booking_json(v_id));
end;
$$;

-- 예약 상태 변경 (방문 완료 / 취소 / 되돌리기)
-- 취소된 예약을 다시 살릴 때는 정원을 검사한다. p_force = true면 초과 허용 (스태프 판단).
create or replace function public.admin_set_status(
  p_booking_id uuid,
  p_status public.booking_status,
  p_force boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_slot public.slots;
begin
  perform private.assert_staff();

  if p_booking_id is null or p_status is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- 잠금 순서: 시간대 → 예약 (다른 함수와 동일)
  select * into v_slot from public.slots where id = v_booking.slot_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;

  if v_booking.status = p_status then
    return jsonb_build_object('ok', true, 'booking', private.admin_booking_json(p_booking_id));
  end if;

  if v_booking.status = 'cancelled'
     and not coalesce(p_force, false)
     and private.active_count(v_slot.id) >= v_slot.capacity then
    return jsonb_build_object('ok', false, 'error', 'SLOT_FULL');
  end if;

  update public.bookings
  set status = p_status,
      checked_in_at = case when p_status = 'checked_in' then now() else null end,
      cancelled_at  = case when p_status = 'cancelled'  then now() else null end
  where id = p_booking_id;

  return jsonb_build_object('ok', true, 'booking', private.admin_booking_json(p_booking_id));
end;
$$;

-- 현장 등록. 접수 on/off, 시작 여부와 무관하게 등록 가능.
-- 정원이 찼거나 닫힌 시간대는 p_force = true일 때만 허용.
create or replace function public.admin_walk_in(p_slot_id bigint, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
  v_new public.bookings;
begin
  perform private.assert_staff();

  select * into v_slot from public.slots where id = p_slot_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'SLOT_UNAVAILABLE');
  end if;

  if not coalesce(p_force, false) then
    if v_slot.is_closed then
      return jsonb_build_object('ok', false, 'error', 'SLOT_CLOSED');
    end if;
    if private.active_count(v_slot.id) >= v_slot.capacity then
      return jsonb_build_object('ok', false, 'error', 'SLOT_FULL');
    end if;
  end if;

  v_new := private.insert_booking(v_slot.id, 'walk_in', null);
  return jsonb_build_object('ok', true, 'booking', private.admin_booking_json(v_new.id));
end;
$$;

-- 시간대 정원 / 닫기·열기. null로 보낸 값은 바꾸지 않는다.
-- 정원을 현재 예약 수보다 낮춰도 기존 예약은 유지된다 (새 예약만 막힘).
create or replace function public.admin_update_slot(
  p_slot_id bigint,
  p_capacity int default null,
  p_is_closed boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.slots;
begin
  perform private.assert_staff();

  if p_capacity is not null and p_capacity < 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  update public.slots
  set capacity  = coalesce(p_capacity, capacity),
      is_closed = coalesce(p_is_closed, is_closed)
  where id = p_slot_id
  returning * into v_slot;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  return jsonb_build_object(
    'ok', true,
    'slot', jsonb_build_object(
      'id', v_slot.id,
      'starts_at', v_slot.starts_at,
      'ends_at', v_slot.ends_at,
      'capacity', v_slot.capacity,
      'is_closed', v_slot.is_closed,
      'active_count', private.active_count(v_slot.id)));
end;
$$;

-- 예약 접수 on/off
create or replace function public.admin_set_booking_open(p_open boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_staff();

  if p_open is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  update public.settings
  set booking_open = p_open, updated_at = now()
  where id = 1;

  return jsonb_build_object('ok', true, 'booking_open', p_open);
end;
$$;

-- 권한
revoke all on function public.admin_list()                                         from public, anon, authenticated;
revoke all on function public.admin_check_in(text)                                 from public, anon, authenticated;
revoke all on function public.admin_set_status(uuid, public.booking_status, boolean) from public, anon, authenticated;
revoke all on function public.admin_walk_in(bigint, boolean)                       from public, anon, authenticated;
revoke all on function public.admin_update_slot(bigint, int, boolean)              from public, anon, authenticated;
revoke all on function public.admin_set_booking_open(boolean)                      from public, anon, authenticated;

grant execute on function public.admin_list()                                         to authenticated;
grant execute on function public.admin_check_in(text)                                 to authenticated;
grant execute on function public.admin_set_status(uuid, public.booking_status, boolean) to authenticated;
grant execute on function public.admin_walk_in(bigint, boolean)                       to authenticated;
grant execute on function public.admin_update_slot(bigint, int, boolean)              to authenticated;
grant execute on function public.admin_set_booking_open(boolean)                      to authenticated;

-- >>>>> migrations/20261102000005_generate_slots.sql
-- =============================================================
-- 5. 시간대 생성 함수 (SQL Editor에서 실행. anon/authenticated는 실행 불가)
-- 시각은 모두 Asia/Seoul 기준으로 해석한다.
--
-- p_replace = true : 그날의 시간대 중 "예약이 한 건도 없는" 시간대를 지운 뒤 다시 만든다.
--                    예약(취소 포함)이 있는 시간대는 그대로 두고, 그와 겹치는 새 시간대는 만들지 않는다.
-- p_replace = false: 기존 시간대는 건드리지 않고, 겹치지 않는 빈 자리만 채운다.
-- =============================================================

create or replace function public.generate_slots(
  p_date date,
  p_start time,
  p_end time,
  p_interval_minutes int,
  p_capacity int,
  p_replace boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz := (p_date + time '00:00') at time zone 'Asia/Seoul';
  v_day_end   timestamptz := (p_date + 1 + time '00:00') at time zone 'Asia/Seoul';
  v_first     timestamptz := (p_date + p_start) at time zone 'Asia/Seoul';
  v_last_end  timestamptz := (p_date + p_end) at time zone 'Asia/Seoul';
  v_step      interval    := make_interval(mins => p_interval_minutes);
  v_deleted   int := 0;
  v_inserted  int := 0;
  v_skipped   int := 0;
  v_t         timestamptz;
begin
  if p_date is null or p_start is null or p_end is null
     or p_interval_minutes is null or p_interval_minutes <= 0
     or p_capacity is null or p_capacity < 0
     or p_end <= p_start then
    raise exception 'INVALID_ARGUMENTS';
  end if;

  if coalesce(p_replace, false) then
    delete from public.slots s
    where s.starts_at >= v_day_start
      and s.starts_at <  v_day_end
      and not exists (select 1 from public.bookings b where b.slot_id = s.id);
    get diagnostics v_deleted = row_count;
  end if;

  v_t := v_first;
  while v_t + v_step <= v_last_end loop
    if exists (
      select 1 from public.slots s
      where s.starts_at < v_t + v_step
        and s.ends_at   > v_t
    ) then
      v_skipped := v_skipped + 1;
    else
      insert into public.slots (starts_at, ends_at, capacity)
      values (v_t, v_t + v_step, p_capacity);
      v_inserted := v_inserted + 1;
    end if;
    v_t := v_t + v_step;
  end loop;

  return jsonb_build_object(
    'deleted', v_deleted,
    'inserted', v_inserted,
    'skipped_overlapping', v_skipped,
    'total_that_day', (select count(*) from public.slots s
                       where s.starts_at >= v_day_start and s.starts_at < v_day_end));
end;
$$;

revoke all on function public.generate_slots(date, time, time, int, int, boolean) from public, anon, authenticated;

-- >>>>> seed/generate_slots.sql (시간대 생성 — 값은 seed 파일 기준)
select public.generate_slots(
  date '2026-11-17',  -- 행사일
  time '10:00',       -- 예약 운영 시작 시각        (확정 필요)
  time '16:20',       -- 마지막 시간대 종료 시각    (확정 필요: 16:20 / 16:30)
  10,                 -- 시간대 간격(분)            (1인 측정 시간 실측 후 조정)
  3,                  -- 시간대별 기본 정원         (1인 측정 시간 실측 후 조정)
  true                -- 예약 없는 시간대 재생성
);

commit;

-- 확인: 시간대 개수
select count(*) as 생성된_시간대 from public.slots;
