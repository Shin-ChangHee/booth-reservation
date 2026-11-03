/**
 * Phase 6 테스트 — 동시 예약(정원 초과 방지)과 예약 규칙
 *
 *   npm run load-test                 # .env 값 사용
 *   npm run load-test -- --confirm    # localhost가 아닌 실제 Supabase에 실행할 때
 *   npm run load-test -- --direct     # REST 대신 DB에 직접 anon 역할로 호출 (로컬 개발용)
 *
 * 필요한 환경변수 (.env)
 *   DATABASE_URL            테스트 시간대를 만들고 지우는 데 사용 (Supabase: Connect → Session pooler 주소)
 *   VITE_SUPABASE_URL       예약 요청을 보낼 주소 (실제 관람객과 같은 경로: anon 키 + RPC)
 *   VITE_SUPABASE_ANON_KEY
 *
 * 하는 일
 *   1. 현재 시각 근처에 테스트용 시간대를 만든다 (초 단위 37초 오프셋 → 실제 시간대와 겹치지 않음)
 *   2. 예약 접수를 잠시 켜고 테스트를 실행한다
 *   3. 테스트 시간대·예약을 모두 지우고, 예약 접수 on/off를 원래 값으로 되돌린다
 *
 * ※ 예약 접수 on/off를 잠시 바꾸므로 행사 중에는 실행하지 마세요.
 */
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

// ---------- 설정 ----------
const args = new Set(process.argv.slice(2))
const DIRECT = args.has('--direct')
const CONFIRM = args.has('--confirm')
const CONCURRENT = Number(process.env.LOAD_TEST_CONCURRENCY ?? 30)
const ROUNDS = Number(process.env.LOAD_TEST_ROUNDS ?? 3)
const CAPACITY = 3

const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.VITE_SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!databaseUrl) {
  console.error('DATABASE_URL이 필요해요. (Supabase 대시보드 → Connect → Session pooler 연결 문자열)')
  process.exit(1)
}
if (!DIRECT && (!supabaseUrl || !anonKey)) {
  console.error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY가 필요해요. (로컬 DB만 시험하려면 --direct)')
  process.exit(1)
}
const isLocal = (u: string) => /(localhost|127\.0\.0\.1)/.test(u)
if (!CONFIRM && (!isLocal(databaseUrl) || (!DIRECT && !isLocal(supabaseUrl!)))) {
  console.error('실제 서버 대상이에요. 예약 접수 on/off를 잠시 바꾸므로 행사 중이 아닌지 확인한 뒤 --confirm을 붙여 실행하세요.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: CONCURRENT + 5 })

type BookResult = { ok: boolean; error?: string; booking?: { code: string } }
type Timed = { result: BookResult | null; transportError?: string; ms: number }

// ---------- 예약 호출 (관람객과 같은 권한: anon) ----------
const sb = !DIRECT ? createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } }) : null

async function bookViaRest(slotId: number, token: string): Promise<Timed> {
  const t0 = performance.now()
  const { data, error } = await sb!.rpc('book_slot', { p_slot_id: slotId, p_device_token: token })
  return { result: error ? null : (data as BookResult), transportError: error?.message, ms: performance.now() - t0 }
}

/** --direct: 연결을 미리 열어 두고 anon 역할로 함수를 호출 */
async function bookViaDb(client: pg.PoolClient, slotId: number, token: string): Promise<Timed> {
  const t0 = performance.now()
  try {
    await client.query('begin')
    await client.query('set local role anon')
    await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`)
    const r = await client.query('select public.book_slot($1, $2) as r', [slotId, token])
    await client.query('commit')
    return { result: r.rows[0].r as BookResult, ms: performance.now() - t0 }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    return { result: null, transportError: String(e), ms: performance.now() - t0 }
  }
}

/** 같은 순간에 여러 건을 보낸다 */
async function burst(requests: { slotId: number; token: string }[]): Promise<Timed[]> {
  if (!DIRECT) return Promise.all(requests.map((r) => bookViaRest(r.slotId, r.token)))
  const clients = await Promise.all(requests.map(() => pool.connect()))
  try {
    return await Promise.all(requests.map((r, i) => bookViaDb(clients[i], r.slotId, r.token)))
  } finally {
    clients.forEach((c) => c.release())
  }
}

const book = async (slotId: number, token: string) => (await burst([{ slotId, token }]))[0]

// ---------- 준비·정리 ----------
const createdSlots: number[] = []
let bookingOpenWas: boolean | null = null

async function createSlot(startOffsetMin: number, capacity: number): Promise<number> {
  const { rows } = await pool.query(
    `insert into public.slots (starts_at, ends_at, capacity)
     values (date_trunc('minute', now()) + make_interval(mins => $1) + interval '37 seconds',
             date_trunc('minute', now()) + make_interval(mins => $1 + 10) + interval '37 seconds',
             $2)
     returning id`,
    [startOffsetMin, capacity],
  )
  createdSlots.push(rows[0].id)
  return rows[0].id
}

const setBookingOpen = (open: boolean) => pool.query('update public.settings set booking_open = $1 where id = 1', [open])

const activeCount = async (slotId: number) =>
  Number(
    (await pool.query(`select count(*) from public.bookings where slot_id = $1 and status in ('booked','checked_in')`, [slotId])).rows[0].count,
  )

async function cleanup() {
  if (createdSlots.length) {
    await pool.query('delete from public.bookings where slot_id = any($1)', [createdSlots])
    await pool.query('delete from public.slots where id = any($1)', [createdSlots])
  }
  if (bookingOpenWas !== null) await setBookingOpen(bookingOpenWas)
}

// ---------- 결과 ----------
type Row = { 항목: string; 기대: string; 결과: string; 판정: 'PASS' | 'FAIL' }
const rows: Row[] = []
const record = (항목: string, 기대: string, 결과: string, pass: boolean) => rows.push({ 항목, 기대, 결과, 판정: pass ? 'PASS' : 'FAIL' })

const tally = (rs: Timed[]) => {
  const m = new Map<string, number>()
  for (const r of rs) {
    const k = r.result ? (r.result.ok ? '성공' : r.result.error ?? '?') : `통신오류`
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}
const fmt = (m: Map<string, number>) => [...m].map(([k, v]) => `${k} ${v}`).join(', ')
const pct = (xs: number[], p: number) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))]

// ---------- 테스트 ----------
async function main() {
  console.log(`대상: ${DIRECT ? 'DB 직접 호출(anon 역할)' : `${supabaseUrl} (REST, anon 키)`} · 동시 ${CONCURRENT}건 × ${ROUNDS}회\n`)

  bookingOpenWas = (await pool.query('select booking_open from public.settings where id = 1')).rows[0].booking_open
  await setBookingOpen(true)

  // 1. 정원 3 시간대에 서로 다른 기기 30건 동시 요청 → 정확히 3건만 성공
  const latencies: number[] = []
  for (let round = 1; round <= ROUNDS; round++) {
    const slotId = await createSlot(60 + round * 15, CAPACITY)
    const results = await burst(Array.from({ length: CONCURRENT }, () => ({ slotId, token: `load-${randomUUID()}` })))
    latencies.push(...results.map((r) => r.ms))
    const m = tally(results)
    const inDb = await activeCount(slotId)
    const codes = results.filter((r) => r.result?.ok).map((r) => r.result!.booking!.code)
    record(
      `동시 예약 ${round}회차: 정원 ${CAPACITY}, 서로 다른 기기 ${CONCURRENT}건`,
      `성공 ${CAPACITY}, SLOT_FULL ${CONCURRENT - CAPACITY}, DB ${CAPACITY}건`,
      `${fmt(m)} / DB ${inDb}건`,
      m.get('성공') === CAPACITY && m.get('SLOT_FULL') === CONCURRENT - CAPACITY && inDb === CAPACITY && new Set(codes).size === codes.length,
    )
  }

  // 2. 같은 기기로 여러 시간대 동시 요청 → 1건만 성공
  {
    const slots = await Promise.all([0, 1, 2, 3, 4].map((i) => createSlot(200 + i * 10, CAPACITY)))
    const token = `load-same-${randomUUID()}`
    const m = tally(await burst(slots.map((slotId) => ({ slotId, token }))))
    record('같은 기기로 5개 시간대 동시 요청', '성공 1, ALREADY_BOOKED 4', fmt(m), m.get('성공') === 1 && m.get('ALREADY_BOOKED') === 4)
  }

  // 3. 같은 기기로 두 시간대 연속 예약 → 두 번째 ALREADY_BOOKED
  {
    const a = await createSlot(300, CAPACITY)
    const b = await createSlot(310, CAPACITY)
    const token = `load-seq-${randomUUID()}`
    const first = await book(a, token)
    const second = await book(b, token)
    record(
      '같은 기기로 두 시간대 연속 예약',
      '첫 번째 성공, 두 번째 ALREADY_BOOKED (기존 코드 반환)',
      `${first.result?.ok ? '성공' : first.result?.error ?? first.transportError} → ${second.result?.error ?? (second.result?.ok ? '성공' : second.transportError)}`,
      !!first.result?.ok && second.result?.error === 'ALREADY_BOOKED' && second.result.booking?.code === first.result.booking?.code,
    )
  }

  // 4. 시작된 시간대 → SLOT_STARTED
  {
    const started = await createSlot(-5, CAPACITY)
    const r = await book(started, `load-${randomUUID()}`)
    record('시작된 시간대 예약', 'SLOT_STARTED', r.result?.error ?? (r.result?.ok ? '성공' : String(r.transportError)), r.result?.error === 'SLOT_STARTED')
  }

  // 5. 접수 중지 → BOOKING_CLOSED
  {
    const slotId = await createSlot(400, CAPACITY)
    await setBookingOpen(false)
    const r = await book(slotId, `load-${randomUUID()}`)
    await setBookingOpen(true)
    record(
      '접수 중지 상태 예약',
      'BOOKING_CLOSED, DB 0건',
      `${r.result?.error ?? (r.result?.ok ? '성공' : String(r.transportError))} / DB ${await activeCount(slotId)}건`,
      r.result?.error === 'BOOKING_CLOSED' && (await activeCount(slotId)) === 0,
    )
  }

  console.table(rows)
  console.log(`응답 시간 (동시 요청): 중간값 ${pct(latencies, 50).toFixed(0)}ms · 95% ${pct(latencies, 95).toFixed(0)}ms · 최대 ${Math.max(...latencies).toFixed(0)}ms`)
  const failed = rows.filter((r) => r.판정 === 'FAIL').length
  console.log(failed ? `\n실패 ${failed}개` : `\n전체 ${rows.length}개 통과`)
  return failed
}

let failed = 1
try {
  failed = await main()
} catch (e) {
  console.error('테스트 중 오류:', e instanceof Error ? e.message : e)
  if (String(e).includes('certificate')) {
    console.error('→ DATABASE_URL 끝에 ?sslmode=require&uselibpqcompat=true 를 붙여 보세요.')
  }
} finally {
  await cleanup().catch((e) => console.error('정리 실패 — SQL Editor에서 테스트 시간대(초 단위 37초)를 지워 주세요:', e))
  await pool.end()
}
process.exit(failed ? 1 : 0)
