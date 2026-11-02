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
