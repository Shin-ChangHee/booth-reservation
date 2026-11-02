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
