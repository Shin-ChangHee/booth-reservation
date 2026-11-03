-- =============================================================
-- 행사 당일 시간대 생성 (Supabase 대시보드 > SQL Editor에 붙여넣고 실행)
--
-- 값이 확정되면 아래 숫자만 고쳐서 몇 번이든 다시 실행하면 된다.
-- 마지막 인자 true = 예약이 없는 시간대는 지우고 다시 만든다 (예약이 있는 시간대는 유지).
-- =============================================================

select public.generate_slots(
  date '2026-11-17',  -- 행사일
  time '10:00',       -- 예약 운영 시작 시각        (확정 필요)
  time '16:20',       -- 마지막 시간대 종료 시각    (확정 필요: 16:20 / 16:30)
  10,                 -- 시간대 간격(분)            (1인 측정 시간 실측 후 조정)
  1,                  -- 시간대별 기본 정원         (1인 측정 시간 실측 후 조정)
  true                -- 예약 없는 시간대 재생성
);

-- -------------------------------------------------------------
-- [선택] 점심시간 등 운영 중단 구간 닫기 — 필요하면 주석을 풀고 시각을 고친다.
-- -------------------------------------------------------------
-- update public.slots
-- set is_closed = true
-- where starts_at >= timestamptz '2026-11-17 12:00 Asia/Seoul'
--   and starts_at <  timestamptz '2026-11-17 13:00 Asia/Seoul';

-- -------------------------------------------------------------
-- [선택] 13:00–14:20 공동 주관 세션 시간대 정원 축소 — 필요하면 주석을 풀고 정원을 고친다.
-- -------------------------------------------------------------
-- update public.slots
-- set capacity = 2
-- where starts_at >= timestamptz '2026-11-17 13:00 Asia/Seoul'
--   and starts_at <  timestamptz '2026-11-17 14:20 Asia/Seoul';

-- 확인
select to_char(starts_at at time zone 'Asia/Seoul', 'HH24:MI') as 시작,
       to_char(ends_at   at time zone 'Asia/Seoul', 'HH24:MI') as 종료,
       capacity as 정원,
       is_closed as 닫힘
from public.slots
where starts_at >= timestamptz '2026-11-17 00:00 Asia/Seoul'
  and starts_at <  timestamptz '2026-11-18 00:00 Asia/Seoul'
order by starts_at;
