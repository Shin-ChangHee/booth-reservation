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
