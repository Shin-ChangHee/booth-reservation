-- =============================================================
-- 7. 예약 마감 상태
--   booking_ended = true  → 관람객 화면 "예약이 마감되었습니다", 새 예약 차단(BOOKING_ENDED)
--   이미 받은 예약·방문 처리·현장 등록은 그대로 동작한다.
--   상태는 셋 중 하나: 접수 중(booking_open) / 접수 꺼짐(바로 체험) / 마감(booking_ended)
-- =============================================================

alter table public.settings
  add column if not exists booking_ended boolean not null default false;

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
    'booking_ended', st.booking_ended,
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

create or replace function public.book_slot(p_slot_id bigint, p_device_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_ended boolean;
  v_slot public.slots;
  v_existing uuid;
  v_new public.bookings;
begin
  if p_slot_id is null
     or p_device_token is null
     or length(p_device_token) not between 16 and 128 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  -- 1. 예약이 마감됐는가 / 접수 중인가
  select booking_open, booking_ended into v_open, v_ended from public.settings where id = 1;
  if coalesce(v_ended, false) then
    return jsonb_build_object('ok', false, 'error', 'BOOKING_ENDED');
  end if;
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
        'booking_ended', st.booking_ended,
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

  -- 접수를 켜면 마감 상태도 풀린다
  update public.settings
  set booking_open = p_open,
      booking_ended = case when p_open then false else booking_ended end,
      updated_at = now()
  where id = 1;

  return jsonb_build_object('ok', true, 'booking_open', p_open);
end;
$$;

-- 예약 마감 / 마감 해제 (마감하면 접수도 꺼진다. 해제하면 '접수 꺼짐' 상태로 돌아간다)
create or replace function public.admin_set_booking_ended(p_ended boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.assert_staff();

  if p_ended is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_REQUEST');
  end if;

  update public.settings
  set booking_ended = p_ended,
      booking_open = case when p_ended then false else booking_open end,
      updated_at = now()
  where id = 1;

  return jsonb_build_object('ok', true, 'booking_ended', p_ended);
end;
$$;

-- 권한 (create or replace는 기존 권한을 유지하지만, 새 함수는 명시적으로 정리)
revoke all on function public.admin_set_booking_ended(boolean) from public, anon, authenticated;
grant execute on function public.admin_set_booking_ended(boolean) to authenticated;
