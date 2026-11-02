/**
 * Phase 1 완료 기준 확인 — 실제 Supabase 프로젝트에 anon 키로 접속해서 권한을 검사한다.
 * 데이터는 바꾸지 않는다 (읽기 시도와 거부되어야 하는 호출만 한다).
 *
 * 실행: npm run verify:anon   (.env의 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 사용)
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('.env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 넣어 주세요.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })
const results: { name: string; passed: boolean; detail: string }[] = []
const record = (name: string, passed: boolean, detail: string) => results.push({ name, passed, detail })
/** 권한 거부 오류인지 (네트워크 오류 등은 거부로 치지 않는다) */
const isDenied = (error: { code?: string; message: string } | null) =>
  !!error && (error.code === '42501' || /permission denied|not authorized/i.test(error.message))

// 0. 연결 확인 겸 공개 상태 → 허용, 코드·토큰 미포함
//    (연결이 안 되면 아래 "거부" 검사가 모두 통과한 것처럼 보이므로 여기서 중단한다)
{
  const { data, error } = await sb.rpc('get_public_state')
  const text = JSON.stringify(data ?? null)
  record(
    'anon get_public_state → 허용 (코드/토큰 미포함)',
    !error && Array.isArray(data?.slots) && !text.includes('"code"') && !text.includes('device'),
    error ? error.message : `접수 ${data.booking_open ? '중' : '중지'}, 남은 시간대 ${data.slots.length}개`,
  )
  if (error) {
    console.error(`Supabase 연결 또는 get_public_state 호출 실패: ${error.message}`)
    console.error('URL·키가 맞는지, 마이그레이션을 적용했는지 확인해 주세요.')
    process.exit(1)
  }
}

// 1. 테이블 직접 조회 → 거부 또는 0건
for (const table of ['bookings', 'slots', 'settings']) {
  const { data, error } = await sb.from(table).select('*').limit(5)
  record(
    `anon ${table} 직접 select → 0건/거부`,
    isDenied(error) || (!error && (data?.length ?? 0) === 0),
    error ? `거부: ${error.message}` : `${data?.length ?? 0}건`,
  )
}

// 2. 테이블 직접 쓰기 → 거부
{
  const { error } = await sb.from('settings').update({ booking_open: true }).eq('id', 1).select()
  record('anon settings 직접 update → 거부', isDenied(error), error?.message ?? '거부되지 않음')
}

// 3. admin RPC → 거부
const adminCalls: [string, Record<string, unknown>][] = [
  ['admin_list', {}],
  ['admin_set_booking_open', { p_open: true }],
  ['admin_check_in', { p_code: 'AAAA' }],
  ['admin_walk_in', { p_slot_id: 1, p_force: true }],
  ['admin_update_slot', { p_slot_id: 1, p_capacity: 99 }],
  ['admin_set_status', { p_booking_id: '00000000-0000-0000-0000-000000000000', p_status: 'checked_in' }],
  ['generate_slots', { p_date: '2099-01-01', p_start: '10:00', p_end: '11:00', p_interval_minutes: 10, p_capacity: 3 }],
]
for (const [fn, args] of adminCalls) {
  const { error } = await sb.rpc(fn, args)
  record(`anon ${fn} 호출 → 거부`, isDenied(error), error?.message ?? '거부되지 않음')
}

console.table(results.map((r) => ({ 결과: r.passed ? 'PASS' : 'FAIL', 항목: r.name, 상세: r.detail })))
const failed = results.filter((r) => !r.passed).length
console.log(failed === 0 ? `전체 ${results.length}개 통과` : `실패 ${failed}개`)
process.exit(failed === 0 ? 0 : 1)
