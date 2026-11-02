# 부스 체험 시간대 예약 시스템 — 프로젝트 계획서

> 이 문서는 Claude Code가 그대로 읽고 구현할 수 있도록 작성된 계획서입니다.
> 프로젝트 루트에 `PLAN.md`로 두고 작업을 시작하세요. (사용법은 맨 아래 "Claude Code 작업 지침" 참고)

---

## 1. 배경과 목표

### 1.1 배경
- 행사: 제4회 문화체육관광 디지털혁신 포럼 (주제: "AI로 여는 새로운 문화생활")
- 일시·장소: 2026년 11월 17일(화), 양재 엘타워 6층 그레이스홀 로비
- 운영 주체: 국민체육진흥공단 디지털혁신팀, 1번 부스
- 부스 콘텐츠: AI 비전 센싱 기반 체형 정렬 및 근골격계 위험도 분석 체험
- 부스 인력: 4명 (공단 직원 3명 + 기기 운영 인력 1명)
- 문제: 1인당 측정 시간이 있어 대기 줄이 길어질 수 있음. 줄이 길어질 때만 "시간대 예약"으로 전환해 관람객이 기다리지 않고 다른 세션·부스를 둘러보다 돌아오게 하고 싶음.

### 1.2 목표
1. 관람객이 부스의 QR코드를 찍고 휴대폰으로 **남은 체험 시간대 하나를 골라 예약**한다.
2. **개인정보(이름, 전화번호 등)를 일절 수집하지 않는다.** 예약 시 짧은 확인코드만 발급한다.
3. 스태프는 관리자 화면에서 시간대별 예약 현황을 보고 **방문 처리, 현장 등록, 시간대 마감, 예약 접수 on/off**를 한다.
4. 시간대별 정원을 넘는 예약(중복 예약, 동시 접속 경쟁)이 **절대 발생하지 않는다.**

### 1.3 운영 규칙 (화면 문구에 반영)
- 예약은 시간대 단위(기본 10분)로 하며, 시간대마다 정원이 있다.
- 지정 시간대 안에 방문하면 우선 체험한다.
- 시간이 지나면 예약은 자동으로 무효가 되지 않지만, **현장 대기 순서로 안내**한다. ("참여 불가" 같은 강한 표현은 쓰지 않는다.)
- 한 기기(휴대폰)당 동시에 유효한 예약은 1건만 가능하다.

### 1.4 범위 밖 (만들지 않는 것)
- 회원가입, 로그인(관람객), 문자·카카오 알림, 결제, 다국어
- 체형 분석 기기와의 연동 (기기는 별도로 운영됨)

---

## 2. 미확정 값 — 사람이 정해서 알려줘야 하는 것

아래 값들은 코드에 하드코딩하지 말고 **설정(시드 스크립트 인자 또는 settings 테이블)** 으로 받는다. Claude Code는 값이 없으면 기본값으로 진행하고, 작업 보고 때 "확정 필요" 목록으로 다시 알려준다.

| 항목 | 기본값 | 비고 |
|---|---|---|
| 부스 예약 운영 시작 시각 | 10:00 | 행사 일정표로 확인 필요 |
| 마지막 시간대 종료 시각 | 16:20 | 기획서 두 문서의 종료 시각이 16:20 / 16:30으로 다름 → 이른 쪽 기준 |
| 시간대 간격 | 10분 | 1인 측정 시간 실측 후 조정 |
| 시간대별 기본 정원 | 3명 | 1인 측정 시간 실측 후 조정 |
| 점심시간 등 운영 중단 구간 | 없음 | 있으면 해당 시간대를 `is_closed = true`로 생성 |
| 13:00–14:20 구간 정원 | 기본 정원과 동일 | 같은 시간에 공동 주관 세션이 있어 부스 인력이 빠질 수 있음 → 정원 축소 검토 |

---

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프론트엔드 | Vite + React + TypeScript | 가볍고 정적 배포가 쉬움 |
| 스타일 | Tailwind CSS | 빠른 모바일 UI 구성 |
| 백엔드/DB | Supabase (Postgres + RPC 함수 + Auth) | 서버 없이 DB 트랜잭션으로 정원 초과를 막을 수 있음 |
| 스태프 인증 | Supabase Auth (이메일+비밀번호, 스태프 공용 계정 1개) | 관리자 화면 보호 |
| 배포 | Vercel 또는 Netlify (정적 호스팅) | 무료, 환경변수 설정 간단 |
| QR 생성 | `qrcode` npm 패키지 (빌드 스크립트) | 인쇄용 PNG 생성 |
| 실시간 갱신 | 폴링 (관람객 15초, 관리자 5초) | Realtime보다 단순하고 혼잡한 네트워크에서 안정적 |

- 패키지는 최신 안정 버전을 쓰되, 발표된 지 2주가 안 된 버전은 피한다.
- 라우팅은 `react-router` 사용, 페이지는 3~4개뿐이므로 구조는 최대한 단순하게 유지한다.

---

## 4. 화면 구성

### 4.1 `/` — 관람객 예약 화면 (모바일 우선)

**상태 A: 예약 접수 중지 (`booking_open = false`)**
- 문구: "지금은 바로 체험하실 수 있어요. 1번 부스로 오세요."
- 부스 위치 안내 한 줄 (6층 그레이스홀 로비, 1번 부스)

**상태 B: 예약 접수 중**
- 상단: 부스 이름, 한 줄 설명 ("AI 카메라로 체형 정렬과 근골격계 위험도를 분석해 드려요.")
- 시간대 목록: 각 행에 `14:30 – 14:40`, 남은 자리 수("2자리 남음"), 상태
  - 이미 시작한 시간대는 목록에서 숨김
  - 정원이 찬 시간대: "마감" 표시, 선택 불가
  - 스태프가 닫은 시간대: 목록에서 숨김
- 시간대 선택 → 확인 단계("14:30 – 14:40에 예약할까요?") → "예약하기" 버튼
- 15초마다 남은 자리 수 자동 갱신. 선택한 사이에 마감되면 "방금 마감됐어요. 다른 시간대를 골라 주세요."

**상태 C: 예약 완료 / 내 예약 있음**
- 큰 글씨로 시간대와 확인코드 표시 (예: `14:30 – 14:40`, 코드 `K7RM`)
- 안내: "이 화면을 캡처해 두세요. 부스에서 코드를 보여주시면 됩니다."
- 규칙 안내: "지정 시간 안에 와 주세요. 시간이 지나면 현장 대기 순서로 안내해 드려요."
- "예약 취소" 버튼 (확인 후 취소 → 자리 반환)
- 같은 기기로 다시 접속하면 이 화면이 먼저 보인다 (localStorage의 device_token + 확인코드로 서버 조회)

### 4.2 `/admin` — 스태프 관리 화면 (태블릿·노트북 기준, 휴대폰에서도 동작)
- 로그인: 이메일+비밀번호 (Supabase Auth). 로그인 상태 유지.
- 상단 바:
  - **예약 접수 on/off 토글** (가장 눈에 띄게)
  - 현재 시각, 현재 진행 중인 시간대
  - 확인코드 입력창 → 엔터 시 해당 예약을 "방문 완료"로 처리하고 결과 표시
- 시간대 목록 (현재 시간대 자동 강조, 자동 스크롤):
  - 시간대, 정원/예약 수/방문 수
  - 정원 +/- 버튼, 시간대 닫기/열기 버튼
  - 펼치면 예약 목록: 확인코드, 출처(QR/현장), 상태, [방문 완료] [취소] 버튼
  - 시간대가 끝났는데 방문 처리되지 않은 예약은 "미방문"으로 흐리게 표시 (상태값은 바꾸지 않고 화면에서만 계산)
- **현장 등록** 버튼: 시간대를 골라 스태프가 직접 1건 추가 → 확인코드 발급 (휴대폰이 없는 분, 종이 카드로 받은 분 입력용)
- 5초마다 자동 갱신

### 4.3 `/board` — 부스 안내 화면 (선택, 태블릿 거치용)
- 로그인 불필요, 읽기 전용
- 큰 글씨: "지금 체험 중: 14:30 – 14:40", "다음 예약 가능: 14:50 (2자리)"
- 예약 페이지 QR코드 크게 표시
- 접수 중지 상태면 "지금 바로 체험 가능" 표시
- 15초마다 갱신

### 4.4 `/poster` — 인쇄용 QR 안내문 (선택)
- A4 세로 인쇄용 페이지: 제목, QR코드, 짧은 이용 방법 3단계, 운영 규칙
- 브라우저 인쇄(Ctrl+P) 시 한 장에 맞게 `@media print` 스타일 적용

---

## 5. 데이터 모델 (Supabase / Postgres)

모든 시각은 `timestamptz`로 저장하고, 화면 표시는 `Asia/Seoul` 기준.

```sql
-- 전역 설정 (단일 행)
create table settings (
  id int primary key default 1 check (id = 1),
  booking_open boolean not null default false,
  booth_title text not null default 'AI 체형 정렬·근골격계 위험도 분석',
  notice text,
  updated_at timestamptz not null default now()
);

-- 체험 시간대
create table slots (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  capacity int not null check (capacity >= 0),
  is_closed boolean not null default false
);

-- 예약
create type booking_status as enum ('booked', 'checked_in', 'cancelled');
create type booking_source as enum ('qr', 'walk_in');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id bigint not null references slots(id),
  code text not null unique,            -- 4자리 확인코드
  status booking_status not null default 'booked',
  source booking_source not null default 'qr',
  device_token text,                    -- 관람객 기기 식별용 무작위 값 (개인정보 아님)
  created_at timestamptz not null default now(),
  checked_in_at timestamptz,
  cancelled_at timestamptz
);
create index on bookings (slot_id);
create index on bookings (device_token);
```

- "유효 예약" = `status in ('booked', 'checked_in')`. 남은 자리 = `capacity - 유효 예약 수`.
- 개인정보 컬럼은 만들지 않는다. 메모 컬럼도 두지 않는다 (스태프가 이름을 적는 일을 막기 위해).

### 5.1 확인코드 규칙
- 4자리, 헷갈리는 문자 제외한 대문자+숫자: `ACDEFGHJKMNPQRTUVWXY34679`
- 생성 시 중복이면 재시도 (최대 10회)

### 5.2 시간대 생성
- `supabase/seed/generate_slots.sql` 또는 SQL 함수 `generate_slots(date, start_time, end_time, interval_minutes, capacity)`
- 행사 전날까지 몇 번이든 다시 만들 수 있게, 예약이 없는 시간대만 지우고 재생성하는 옵션 제공

---

## 6. 서버 로직 (RPC 함수, 핵심)

관람객(anon)은 테이블에 직접 접근하지 못하고 **아래 RPC 함수로만** 읽고 쓴다. 함수는 `security definer`로 만들고 `search_path`를 고정한다.

### 6.1 `get_public_state()` — anon 허용
반환: `booking_open`, `booth_title`, `notice`, 그리고 아직 끝나지 않고 닫히지 않은 시간대 목록(`id, starts_at, ends_at, remaining`). **확인코드나 예약 목록은 절대 반환하지 않는다.**

### 6.2 `book_slot(p_slot_id bigint, p_device_token text)` — anon 허용
반드시 한 트랜잭션 안에서:
1. `settings.booking_open`이 false면 오류 `BOOKING_CLOSED`
2. 해당 시간대를 `select ... for update`로 잠금
3. 시간대가 없거나 닫혔으면 `SLOT_UNAVAILABLE`, 이미 시작했으면 `SLOT_STARTED`
4. 같은 `device_token`으로 끝나지 않은 시간대의 유효 예약이 있으면 `ALREADY_BOOKED` (기존 예약 정보를 함께 반환)
5. 유효 예약 수 ≥ 정원이면 `SLOT_FULL`
6. 확인코드 생성 후 insert, `{code, starts_at, ends_at}` 반환

### 6.3 `get_my_booking(p_device_token text, p_code text)` — anon 허용
두 값이 모두 일치하는 예약만 반환. 시간대 정보 포함.

### 6.4 `cancel_my_booking(p_device_token text, p_code text)` — anon 허용
두 값이 일치하고 `status = 'booked'`일 때만 `cancelled`로 변경.

### 6.5 스태프용 — authenticated만 허용
- `admin_list()` : 전체 시간대 + 예약 목록
- `admin_check_in(p_code)` : 코드로 방문 처리. 이미 방문/취소된 코드면 그 사실을 반환
- `admin_set_status(p_booking_id, p_status)`
- `admin_walk_in(p_slot_id)` : 현장 등록. 정원 검사는 하되 `p_force boolean` 인자로 초과 허용 가능 (스태프 판단)
- `admin_update_slot(p_slot_id, p_capacity, p_is_closed)`
- `admin_set_booking_open(p_open boolean)`

### 6.6 권한(RLS)
- 세 테이블 모두 RLS 활성화, anon에게는 select/insert/update 정책을 **하나도 주지 않는다** (RPC로만 접근).
- authenticated에게만 admin RPC 실행 권한 부여. anon RPC는 `grant execute ... to anon`.

---

## 7. 프론트엔드 구현 세부

- `device_token`: 첫 방문 시 `crypto.randomUUID()`로 만들어 localStorage에 저장. localStorage 접근은 try/catch로 감싸고, 실패하면 메모리 값으로 동작.
- 내 예약 정보(`code`)도 localStorage에 저장 → 재접속 시 `get_my_booking`으로 서버 확인 후 상태 C 표시.
- 서버 오류 코드를 사용자 문구로 매핑:
  - `BOOKING_CLOSED` → "지금은 예약 없이 바로 체험하실 수 있어요. 부스로 오세요."
  - `SLOT_FULL` → "방금 마감됐어요. 다른 시간대를 골라 주세요."
  - `SLOT_STARTED` → "이미 시작된 시간대예요. 다음 시간대를 골라 주세요."
  - `ALREADY_BOOKED` → 기존 예약 화면으로 이동
  - 네트워크 오류 → "연결이 불안정해요. 잠시 후 다시 눌러 주세요." + 다시 시도 버튼
- 예약 버튼은 요청 중 비활성화 (연타 방지).
- 개발용 시간 조작: 개발 모드에서만 `?now=2026-11-17T14:25` 쿼리로 화면의 "현재 시각"을 바꿀 수 있게 해서 시간대 경과를 테스트한다. (서버 검증은 실제 시각 기준이므로, 서버 쪽 테스트는 시간대를 현재 시각 근처로 생성해서 한다.)
- 검색엔진 노출 방지: `<meta name="robots" content="noindex">`.

---

## 8. 디자인 방향

- 사용자: 포럼에 온 공공기관·업계 관계자, 연령대 다양함 → **큰 글씨, 큰 터치 영역(최소 48px), 높은 대비**
- 핵심 화면은 "남은 시간대를 고르는 표"와 "확인코드 화면" 두 개. 확인코드 화면의 시간대·코드 표기를 이 서비스에서 가장 기억에 남는 요소로 만든다 (캡처해서 보여주는 화면이므로).
- 색: 체육·움직임을 떠올리는 맑은 블루 계열을 주색으로, 경기장 트랙을 연상시키는 보조색 하나. 회색 카드 나열, 그라데이션 장식, 이모지 남발은 피한다.
- 서체: 한글 가독성이 좋은 Pretendard (Google Fonts 또는 CDN), 숫자(시각·코드)는 고정폭 숫자(`font-variant-numeric: tabular-nums`).
- 공단 로고·마스코트 이미지는 별도로 받기 전까지 넣지 않는다. 텍스트로만 기관명 표기.
- 다크모드는 필수 아님. 단, 시스템 다크모드에서도 글자가 안 보이는 일이 없게 배경색을 명시한다.
- 문구는 짧고 구체적으로. 버튼은 하는 일을 그대로: "예약하기", "예약 취소", "방문 완료".

---

## 9. 폴더 구조 (권장)

```
booth-booking/
├─ PLAN.md
├─ CLAUDE.md                # 작업 규칙 요약 (Phase 0에서 생성)
├─ .env.example             # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├─ supabase/
│  ├─ migrations/           # 테이블, RLS, RPC 함수
│  ├─ seed/generate_slots.sql
│  └─ tests/                # 동시성·권한 테스트 SQL/스크립트
├─ scripts/
│  ├─ make-qr.ts            # 배포 URL → qr.png
│  └─ load-test.ts          # 동시 예약 테스트
└─ src/
   ├─ lib/supabase.ts
   ├─ lib/api.ts            # RPC 호출 래퍼 + 오류 코드 매핑
   ├─ lib/device.ts         # device_token, 내 예약 저장
   ├─ lib/time.ts           # KST 표시, 개발용 now 조작
   ├─ pages/Visitor.tsx
   ├─ pages/Admin.tsx
   ├─ pages/Board.tsx
   ├─ pages/Poster.tsx
   └─ components/...
```

---

## 10. 작업 단계와 완료 기준

각 단계가 끝나면 **완료 기준을 직접 확인하고, 결과와 다음 단계에서 사람이 할 일을 보고한 뒤 멈춘다.**

### Phase 0 — 프로젝트 준비
- Vite + React + TS + Tailwind 초기화, 폴더 구조 생성, `.env.example`, `CLAUDE.md` 작성
- 완료 기준: `npm run dev`로 빈 화면 3개(`/`, `/admin`, `/board`)가 라우팅됨

### Phase 1 — DB와 서버 로직
- 마이그레이션(테이블, enum, RLS, RPC 함수), 시간대 생성 SQL
- 완료 기준:
  - Supabase에 적용 후 시간대가 설정값대로 생성됨
  - anon 키로 `bookings` 테이블 직접 select 시 0건 또는 거부됨
  - anon 키로 admin RPC 호출 시 거부됨

### Phase 2 — 관람객 화면
- 상태 A/B/C, 예약·취소·재접속 복원, 오류 문구, 15초 폴링
- 완료 기준: 휴대폰 크기(375px)에서 예약 → 캡처용 화면 → 새로고침 후에도 내 예약 표시 → 취소 시 남은 자리 1 증가

### Phase 3 — 스태프 화면
- 로그인, 접수 on/off, 코드 입력 방문 처리, 현장 등록, 정원·시간대 닫기, 5초 폴링
- 완료 기준: 관리자에서 접수를 끄면 관람객 화면이 15초 안에 상태 A로 바뀜. 코드 입력 한 번으로 방문 처리됨.

### Phase 4 — 안내 화면과 인쇄물 (선택)
- `/board`, `/poster`, `scripts/make-qr.ts`
- 완료 기준: 포스터가 A4 한 장으로 인쇄 미리보기됨, QR을 휴대폰으로 찍으면 예약 화면이 열림

### Phase 5 — 배포
- Vercel 또는 Netlify 배포 설정, 환경변수 안내, 배포 URL로 QR 재생성
- 완료 기준: 외부 LTE 환경 휴대폰에서 배포 URL 접속·예약 성공

### Phase 6 — 테스트
- `scripts/load-test.ts`: 정원 3인 시간대에 서로 다른 device_token으로 30건 동시 요청 → **정확히 3건만 성공**
- 같은 device_token으로 두 시간대 연속 예약 시도 → 두 번째는 `ALREADY_BOOKED`
- 시작된 시간대 예약 시도 → `SLOT_STARTED`
- 접수 중지 상태 예약 시도 → `BOOKING_CLOSED`
- 완료 기준: 위 테스트 전부 통과, 결과를 표로 보고

---

## 11. 행사 운영 체크리스트 (사람이 할 일)

**사전**
- [ ] 외부 클라우드 서비스(Supabase, Vercel/Netlify) 사용에 대한 내부 보안성 검토·승인 필요 여부 확인
- [ ] 1인 측정 시간 실측 → 시간대 간격·정원 확정 → 시간대 재생성
- [ ] 행사 종료 시각(16:20 / 16:30) 주최 측 확인
- [ ] 스태프 공용 계정 생성, 비밀번호는 부스 인력에게만 공유
- [ ] QR 포스터 인쇄 (A4 2~3장), 부스 전면·대기 위치에 부착
- [ ] **종이 시간대 카드 예비 준비** (네트워크 장애나 휴대폰 사용이 어려운 분 대비, 스태프가 관리자 화면에 "현장 등록"으로 입력)
- [ ] 행사 2~3일 전 리허설: 스태프 휴대폰 4대로 예약·방문 처리·접수 on/off 시연

**당일**
- [ ] 시작 전 시간대 재확인, 접수는 꺼 둔 상태로 시작
- [ ] 줄이 길어지면 관리자 화면에서 접수 켜기, 줄이 줄면 끄기
- [ ] 13:00–14:20 세션 시간대 인력 상황에 따라 정원 조정

**사후**
- [ ] 관리자 화면에서 통계 내보내기 (시간대별 예약 수·방문 수·취소 수, 개인정보 없음) → 성과 보고용
- [ ] 행사 종료 후 예약 데이터 삭제, Supabase 프로젝트 정지 또는 삭제

> 통계 내보내기: Phase 3에 "CSV로 내려받기" 버튼을 함께 구현한다 (시간대, 정원, 예약, 방문, 취소, 현장 등록 수).

---

## 12. Claude Code 작업 지침

**작업 규칙** (Phase 0에서 이 내용을 `CLAUDE.md`로 옮겨 적는다)
1. 이 계획서의 범위 밖 기능은 추가하지 않는다. 필요해 보이면 먼저 제안하고 승인을 받는다.
2. 개인정보를 받는 입력란·컬럼을 만들지 않는다.
3. 정원 검사는 반드시 DB 트랜잭션(행 잠금) 안에서 한다. 프론트엔드 검사만으로 막지 않는다.
4. 화면 문구는 한국어, 이 문서의 문구를 우선 사용한다.
5. 각 Phase 끝에 완료 기준을 직접 확인하고, 사람이 해야 할 일(계정 생성, 키 입력, 결정 사항)을 목록으로 보고한 뒤 멈춘다.
6. 비밀값(키, 비밀번호)은 코드에 넣지 않고 `.env`로만 받는다. `.env`는 커밋하지 않는다.

**사람이 미리 준비할 것**
- Supabase 계정과 새 프로젝트 → Project URL, anon key
- Vercel 또는 Netlify 계정
- Node.js (LTS)

**첫 지시 예시**
```
PLAN.md를 끝까지 읽고 Phase 0부터 시작해 줘.
각 Phase가 끝나면 완료 기준을 확인한 결과와 내가 해야 할 일을 알려주고 멈춰 줘.
```
