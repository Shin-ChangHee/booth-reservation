import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  adminCheckIn,
  adminList,
  ADMIN_MESSAGES,
  adminSetBookingOpen,
  adminSetStatus,
  adminUpdateSlot,
  ApiError,
  type AdminBooking,
  type AdminSlot,
  type AdminState,
  type BookingStatus,
  type CheckInResult,
} from '../../lib/api'
import { BOOTH } from '../../lib/booth'
import { buildStatsCsv, downloadText } from '../../lib/csv'
import { formatRange, formatTime, isDevTimeOverride, now, syncServerTime } from '../../lib/time'
import { usePolling } from '../../lib/usePolling'
import { Notice } from '../ui'
import { SlotCard } from './SlotCard'
import { WalkInDialog } from './WalkInDialog'

const POLL_MS = 5_000

const barButton =
  'inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-xl px-4 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

function Clock() {
  const [t, setT] = useState(now())
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <span className="tabular text-2xl font-extrabold" aria-label="현재 시각">
      {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(t)}
    </span>
  )
}

function checkInMessage(r: CheckInResult): { tone: 'info' | 'warn' | 'error'; text: string } {
  const b = r.booking
  const when = b ? ` · ${formatRange(b.starts_at, b.ends_at)}` : ''
  switch (r.result) {
    case 'CHECKED_IN':
      return { tone: 'info', text: `${b?.code} 방문 완료${when}${b?.source === 'walk_in' ? ' (현장)' : ''}` }
    case 'ALREADY_CHECKED_IN':
      return { tone: 'warn', text: `${b?.code} 이미 방문 처리된 코드예요${b?.checked_in_at ? ` (${formatTime(b.checked_in_at)} 처리)` : ''}${when}` }
    case 'CANCELLED':
      return { tone: 'error', text: `${b?.code} 취소된 예약이에요${when}` }
    default:
      return { tone: 'error', text: '없는 코드예요. 다시 확인해 주세요.' }
  }
}

export function Dashboard({ onSignOut }: { onSignOut: (message?: string) => void }) {
  const [data, setData] = useState<AdminState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [walkInOpen, setWalkInOpen] = useState(false)

  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const seq = useRef(0)
  const scrolled = useRef(false)

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.kind === 'UNAUTHORIZED') {
        onSignOut(ADMIN_MESSAGES.UNAUTHORIZED)
        return
      }
      setActionError(e instanceof ApiError ? ADMIN_MESSAGES[e.kind] : ADMIN_MESSAGES.NETWORK)
    },
    [onSignOut],
  )

  const refresh = useCallback(async () => {
    const mySeq = ++seq.current
    try {
      const st = await adminList()
      if (mySeq !== seq.current) return
      syncServerTime(st.now)
      setData(st)
      setLoadError(null)
    } catch (e) {
      if (mySeq !== seq.current) return
      if (e instanceof ApiError && e.kind === 'UNAUTHORIZED') return onSignOut(ADMIN_MESSAGES.UNAUTHORIZED)
      setLoadError(ADMIN_MESSAGES.NETWORK)
    }
  }, [onSignOut])

  useEffect(() => {
    void refresh()
  }, [refresh])
  usePolling(() => void refresh(), POLL_MS)

  // 현재·다음 시간대
  const t = now()
  const slots = data?.slots ?? []
  const current = slots.find((s) => Date.parse(s.starts_at) <= t && t < Date.parse(s.ends_at)) ?? null
  const next = slots.find((s) => Date.parse(s.starts_at) > t) ?? null
  const focusId = (current ?? next)?.id ?? null

  // 현재 시간대 자동 펼침
  useEffect(() => {
    if (current) setExpanded((prev) => (prev.has(current.id) ? prev : new Set(prev).add(current.id)))
  }, [current?.id])

  // 처음 불러왔을 때 현재(없으면 다음) 시간대로 스크롤
  useEffect(() => {
    if (scrolled.current || focusId == null) return
    scrolled.current = true
    requestAnimationFrame(() => document.getElementById(`slot-${focusId}`)?.scrollIntoView({ block: 'center' }))
  }, [focusId])

  const totals = useMemo(
    () =>
      slots.reduce(
        (acc, s) => ({ active: acc.active + s.active_count, checkedIn: acc.checkedIn + s.checked_in_count, walkIn: acc.walkIn + s.walk_in_count }),
        { active: 0, checkedIn: 0, walkIn: 0 },
      ),
    [slots],
  )

  async function run(action: () => Promise<{ ok: boolean; error?: string } | void>) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const r = await action()
      if (r && !r.ok && r.error) setActionError(ADMIN_MESSAGES[r.error] ?? r.error)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const toggleOpen = () => data && run(() => adminSetBookingOpen(!data.settings.booking_open))

  const setCapacity = (slot: AdminSlot, capacity: number) => run(() => adminUpdateSlot(slot.id, { capacity }))

  function toggleClosed(slot: AdminSlot) {
    if (!slot.is_closed && slot.active_count > 0 && !window.confirm(`예약 ${slot.active_count}건이 있어요. 닫아도 기존 예약은 유지되고, 새 예약만 막혀요. 닫을까요?`)) return
    void run(() => adminUpdateSlot(slot.id, { isClosed: !slot.is_closed }))
  }

  function setStatus(booking: AdminBooking, status: BookingStatus) {
    if (status === 'cancelled' && !window.confirm(`${booking.code} 예약을 취소할까요?`)) return
    void run(async () => {
      const r = await adminSetStatus(booking.id, status)
      if (!r.ok && r.error === 'SLOT_FULL') {
        if (window.confirm('정원이 찼어요. 정원을 넘겨서 되살릴까요?')) return adminSetStatus(booking.id, status, true)
        return
      }
      return r
    })
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    const value = code.trim().toUpperCase()
    if (!value || checking) return
    setChecking(true)
    try {
      const r = await adminCheckIn(value)
      setCheckResult(checkInMessage(r))
      if (r.result === 'CHECKED_IN') setCode('')
      void refresh()
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'UNAUTHORIZED') return onSignOut(ADMIN_MESSAGES.UNAUTHORIZED)
      setCheckResult({ tone: 'error', text: ADMIN_MESSAGES.NETWORK })
    } finally {
      setChecking(false)
      codeRef.current?.focus()
    }
  }

  function downloadCsv() {
    if (!data) return
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now()).replace(/-/g, '')
    downloadText(`booth-stats-${day}.csv`, buildStatsCsv(data.slots))
  }

  const open = data?.settings.booking_open ?? false

  return (
    <>
      {/* 상단 바 */}
      <header className="z-10 border-b-2 md:sticky md:top-0 border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <h1 className="text-lg font-extrabold">{BOOTH.number} 예약 관리</h1>
            <Clock />
            <span className="tabular text-base text-slate-700">
              {current ? (
                <>
                  진행 중 <strong className="text-track-600">{formatRange(current.starts_at, current.ends_at)}</strong>
                </>
              ) : next ? (
                <>
                  다음 <strong className="text-ink">{formatRange(next.starts_at, next.ends_at)}</strong>
                </>
              ) : (
                '진행 중인 시간대 없음'
              )}
            </span>
            {isDevTimeOverride() && <span className="rounded bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-900">개발용 시각</span>}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            {/* 예약 접수 on/off */}
            <button
              type="button"
              role="switch"
              aria-checked={open}
              aria-label="예약 접수"
              disabled={!data || busy}
              onClick={toggleOpen}
              className={`flex min-h-16 items-center gap-4 rounded-2xl px-5 text-left transition-colors disabled:opacity-60 md:w-80 ${
                open ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-ink hover:bg-slate-300'
              }`}
            >
              <span aria-hidden="true" className={`relative h-8 w-14 shrink-0 rounded-full ${open ? 'bg-white/30' : 'bg-slate-400'}`}>
                <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${open ? 'left-7' : 'left-1'}`} />
              </span>
              <span>
                <span className="block text-xl font-extrabold">{open ? '예약 접수 중' : '예약 접수 꺼짐'}</span>
                <span className={`block text-sm font-semibold ${open ? 'text-brand-100' : 'text-slate-600'}`}>
                  {open ? '관람객이 시간대를 예약할 수 있어요' : '관람객 화면: "바로 체험하실 수 있어요"'}
                </span>
              </span>
            </button>

            {/* 확인코드 입력 */}
            <form onSubmit={submitCode} className="flex flex-1 gap-2" aria-label="확인코드 방문 처리">
              <label htmlFor="checkin-code" className="sr-only">
                확인코드
              </label>
              <input
                id="checkin-code"
                ref={codeRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                placeholder="확인코드 4자리"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="done"
                className="tabular min-h-16 w-full min-w-0 flex-1 rounded-2xl border-2 border-slate-300 bg-white px-4 text-3xl font-extrabold tracking-[0.2em] text-ink placeholder:text-lg placeholder:font-semibold placeholder:tracking-normal placeholder:text-slate-400 focus:border-brand-600 focus:outline-none"
              />
              <button type="submit" disabled={checking || code.length === 0} className={`${barButton} min-h-16 shrink-0 bg-brand-600 px-5 text-lg text-white hover:bg-brand-700`}>
                {checking ? '처리 중…' : '방문 처리'}
              </button>
            </form>
          </div>

          {checkResult && (
            <div aria-live="polite">
              <Notice tone={checkResult.tone}>{checkResult.text}</Notice>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setWalkInOpen(true)} disabled={!data} className={`${barButton} border-2 border-brand-600 text-brand-700 hover:bg-brand-50`}>
              현장 등록
            </button>
            <button type="button" onClick={downloadCsv} disabled={!data} className={`${barButton} border-2 border-slate-300 text-slate-700 hover:bg-slate-100`}>
              CSV로 내려받기
            </button>
            <span className="tabular ml-1 text-sm text-slate-600">
              전체 예약 {totals.active} · 방문 {totals.checkedIn} · 현장 {totals.walkIn}
            </span>
            <button type="button" onClick={() => onSignOut()} className={`${barButton} ml-auto text-slate-600 hover:bg-slate-100`}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-4 pb-16">
        {loadError && (
          <div className="mb-3">
            <Notice tone="warn">{loadError} 화면 정보가 최신이 아닐 수 있어요.</Notice>
          </div>
        )}
        {actionError && (
          <div className="mb-3">
            <Notice tone="error">{actionError}</Notice>
          </div>
        )}

        {!data && !loadError && <p className="py-16 text-center text-lg text-slate-500">불러오는 중…</p>}
        {data && slots.length === 0 && (
          <Notice tone="info">시간대가 없어요. Supabase SQL Editor에서 supabase/seed/generate_slots.sql을 실행해 주세요.</Notice>
        )}

        <div className="flex flex-col gap-3">
          {slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              isCurrent={slot.id === current?.id}
              isPast={Date.parse(slot.ends_at) <= t}
              expanded={expanded.has(slot.id)}
              busy={busy}
              onToggleExpand={() =>
                setExpanded((prev) => {
                  const n = new Set(prev)
                  if (n.has(slot.id)) n.delete(slot.id)
                  else n.add(slot.id)
                  return n
                })
              }
              onCapacity={(c) => setCapacity(slot, c)}
              onToggleClosed={() => toggleClosed(slot)}
              onSetStatus={setStatus}
            />
          ))}
        </div>
        <p className="mt-6 text-sm text-slate-500">5초마다 자동으로 새로고침돼요.</p>
      </main>

      {walkInOpen && data && (
        <WalkInDialog
          slots={data.slots}
          onClose={() => setWalkInOpen(false)}
          onDone={() => void refresh()}
          onUnauthorized={() => onSignOut(ADMIN_MESSAGES.UNAUTHORIZED)}
        />
      )}
    </>
  )
}
