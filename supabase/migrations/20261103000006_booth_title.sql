-- =============================================================
-- 6. 부스 이름 변경
-- =============================================================
alter table public.settings
  alter column booth_title set default 'AI가 읽는 내 몸 - 체형 정렬 & 근골격계 위험도 분석 체험존';

update public.settings
set booth_title = 'AI가 읽는 내 몸 - 체형 정렬 & 근골격계 위험도 분석 체험존',
    updated_at = now()
where id = 1;
