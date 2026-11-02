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
