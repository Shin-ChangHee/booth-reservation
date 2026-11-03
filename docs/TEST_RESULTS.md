# 테스트 결과 (Phase 6)

## 실행 방법
```bash
npm run load-test -- --confirm
```
- `.env`에 `DATABASE_URL`(Supabase → Connect → Session pooler), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 필요
- 현재 시각 근처에 테스트 시간대를 만들고(초 단위 37초), 끝나면 시간대·예약을 지우고 예약 접수 on/off를 원래대로 되돌림
- 예약 접수 on/off를 잠시 바꾸므로 **행사 중에는 실행 금지**
- 동시 요청 수·반복 횟수: `LOAD_TEST_CONCURRENCY`(기본 30), `LOAD_TEST_ROUNDS`(기본 3)

## 1. 로컬 결과 (2026-11-03, Postgres 16 + 마이그레이션 그대로, 예약 요청은 HTTP로 동시 전송)

| 항목 | 기대 | 결과 | 판정 |
|---|---|---|---|
| 동시 예약 1회차: 정원 3, 서로 다른 기기 30건 | 성공 3, SLOT_FULL 27, DB 3건 | 성공 3, SLOT_FULL 27 / DB 3건 | PASS |
| 동시 예약 2회차 | 〃 | 성공 3, SLOT_FULL 27 / DB 3건 | PASS |
| 동시 예약 3회차 | 〃 | 성공 3, SLOT_FULL 27 / DB 3건 | PASS |
| 같은 기기로 5개 시간대 동시 요청 | 성공 1, ALREADY_BOOKED 4 | 성공 1, ALREADY_BOOKED 4 | PASS |
| 같은 기기로 두 시간대 연속 예약 | 두 번째 ALREADY_BOOKED (기존 코드 반환) | 성공 → ALREADY_BOOKED | PASS |
| 시작된 시간대 예약 | SLOT_STARTED | SLOT_STARTED | PASS |
| 접수 중지 상태 예약 | BOOKING_CLOSED, DB 0건 | BOOKING_CLOSED / DB 0건 | PASS |

응답 시간(로컬, 동시 30건): 중간값 42ms · 95% 137ms · 최대 142ms

**테스트가 실제로 잡아내는지 확인**: 행 잠금(`for update`)과 기기 잠금을 일부러 뺀 함수로 돌리면
"정원 3에 성공 6 / DB 6건", "같은 기기 5개 시간대 동시 → 성공 5"로 **FAIL**이 나옴 → 잠금이 정원 초과를 막고 있음을 확인.

그 밖의 자동 테스트 (로컬): DB 권한·규칙 SQL 48개, 관람객 화면 19개, 스태프 화면 29개, 안내·포스터 11개 모두 통과.

## 2. 실제 Supabase 결과
> 배포 후 `npm run load-test -- --confirm` 결과를 여기에 붙여 넣으세요.

| 항목 | 결과 | 판정 |
|---|---|---|
| 동시 예약 (3회) | | |
| 같은 기기 동시 다중 시간대 | | |
| 같은 기기 연속 예약 | | |
| 시작된 시간대 | | |
| 접수 중지 | | |
