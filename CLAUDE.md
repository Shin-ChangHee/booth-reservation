# CLAUDE.md — 부스 체험 시간대 예약 시스템

전체 계획은 `PLAN.md`를 따른다. 이 파일은 작업 규칙 요약이다.

## 작업 규칙
1. `PLAN.md`의 범위 밖 기능은 추가하지 않는다. 필요해 보이면 먼저 제안하고 승인을 받는다.
2. 개인정보(이름, 전화번호 등)를 받는 입력란·컬럼을 만들지 않는다. 메모 컬럼도 두지 않는다.
3. 정원 검사는 반드시 DB 트랜잭션(행 잠금, `select ... for update`) 안에서 한다. 프론트엔드 검사만으로 막지 않는다.
4. 화면 문구는 한국어, `PLAN.md`의 문구를 우선 사용한다.
5. 각 Phase 끝에 완료 기준을 직접 확인하고, 사람이 해야 할 일(계정 생성, 키 입력, 결정 사항)을 목록으로 보고한 뒤 멈춘다.
6. 비밀값(키, 비밀번호)은 코드에 넣지 않고 `.env`로만 받는다. `.env`는 커밋하지 않는다.

## 기술 스택
- Vite + React + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), `react-router`
- Supabase (Postgres + RPC + Auth). 관람객(anon)은 테이블 직접 접근 금지, RPC로만 읽고 쓴다.
- 실시간 갱신은 폴링 (관람객·안내 화면 15초, 관리자 5초)
- 패키지는 발표 2주 이상 지난 버전만 쓴다 (`.npmrc`의 `before=` 날짜를 갱신해서 사용)

## 명령어
- `npm run dev` — 개발 서버
- `npm run build` — 타입 검사 + 프로덕션 빌드
- `npm run typecheck` — 타입 검사만

## 구조
- `src/pages/` — `Visitor`(`/`), `Admin`(`/admin`), `Board`(`/board`), `Poster`(`/poster`)
- `src/lib/` — `supabase.ts`, `api.ts`(RPC 래퍼·오류 문구), `device.ts`(device_token), `time.ts`(KST 표시, 개발용 `?now=`)
- `supabase/migrations/` — 테이블, RLS, RPC / `supabase/seed/` — 시간대 생성 / `supabase/tests/` — 권한·동시성 테스트
- `scripts/` — `make-qr.ts`, `load-test.ts`

## 디자인 원칙
- 큰 글씨, 터치 영역 최소 48px, 높은 대비. 시각·코드는 `tabular-nums`.
- 주색 블루(`brand-*`), 보조색 트랙 오렌지(`track-*`). 그라데이션·이모지 남발 금지.
- 배경색을 명시해 시스템 다크모드에서도 글자가 보이게 한다.
