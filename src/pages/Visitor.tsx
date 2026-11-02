import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { SlotList } from '../components/SlotList'
import { Ticket } from '../components/Ticket'
import { Button, Notice, TrackStripe } from '../components/ui'
import {
  bookSlot,
  cancelMyBooking,
  getMyBooking,
  getPublicState,
  messageFor,
  VISITOR_MESSAGES,
  type MyBooking,
  type PublicSlot,
  type PublicState,
} from '../lib/api'
import { BOOTH } from '../lib/booth'
import { clearSavedCode, getDeviceToken, getSavedCode, saveCode } from '../lib/device'
import { formatDateTime, isDevTimeOverride, now, syncServerTime } from '../lib/time'
import { usePolling } from '../lib/usePolling'

const POLL_MS = 15_000

type Message = { tone: 'info' | 'error'; text: string }

export default function Visitor() {
  const token = useMemo(getDeviceToken, [])

  const [state, setState] = useState<PublicState | null>(null)
  const [booking, setBooking] = useState<MyBooking | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [connectionWarning, setConnectionWarning] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const [selected, setSelected] = useState<PublicSlot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sheetError, setSheetError] = useState<string | null>(null)

  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // 응답 순서 꼬임 방지: 예약·취소 직후에는 그 전에 출발한 조회 결과를 버린다
  const seq = useRef(0)
  const hasLoaded = useRef(false)

  const refresh = useCallback(async () => {
    const mySeq = ++seq.current
    const code = getSavedCode()
    try {
      const [st, mine] = await Promise.all([
        getPublicState(),
        code ? getMyBooking(token, code) : Promise.resolve(null),
      ])
      if (mySeq !== seq.current) return
      syncServerTime(st.now)
      hasLoaded.current = true
      setState(st)
      setLoadError(null)
      setConnectionWarning(false)

      if (!code) {
        setBooking(null)
      } else if (mine && mine.status !== 'cancelled') {
        setBooking(mine)
      } else {
        // 취소됐거나(스태프 처리 포함) 찾을 수 없는 예약 → 저장값 정리
        if (mine?.status === 'cancelled') {
          setMessage({ tone: 'info', text: '예약이 취소됐어요. 필요하시면 다시 예약해 주세요.' })
        }
        clearSavedCode()
        setBooking(null)
      }
    } catch (e) {
      if (mySeq !== seq.current) return
      if (hasLoaded.current) setConnectionWarning(true)
      else setLoadError(messageFor(e))
    }
  }, [token])

  useEffect(() => {
    void refresh()
  }, [refresh])

  usePolling(() => void refresh(), POLL_MS)

  // 아직 시작하지 않은 시간대만 보여준다
  const visibleSlots = useMemo(() => {
    if (!state) return []
    const t = now()
    return state.slots.filter((s) => Date.parse(s.starts_at) > t)
  }, [state])

  // 고르는 사이에 마감·시작된 경우
  useEffect(() => {
    if (!selected || submitting) return
    const latest = visibleSlots.find((s) => s.id === selected.id)
    if (!latest || latest.remaining <= 0) {
      setSelected(null)
      setSheetError(null)
      setMessage({ tone: 'error', text: VISITOR_MESSAGES.SLOT_FULL })
    }
  }, [visibleSlots, selected, submitting])

  const closeSheet = useCallback(() => {
    setSelected(null)
    setSheetError(null)
  }, [])

  async function confirmBooking() {
    if (!selected || submitting) return
    setSubmitting(true)
    setSheetError(null)
    try {
      const result = await bookSlot(selected.id, token)
      seq.current++
      if (result.ok) {
        saveCode(result.booking.code)
        setBooking(result.booking)
        setMessage(null)
        setSelected(null)
        window.scrollTo({ top: 0 })
      } else if (result.error === 'ALREADY_BOOKED' && result.booking) {
        saveCode(result.booking.code)
        setBooking(result.booking)
        setMessage({ tone: 'info', text: '이미 예약하신 시간대가 있어요.' })
        setSelected(null)
        window.scrollTo({ top: 0 })
      } else {
        setSelected(null)
        setMessage({ tone: 'error', text: VISITOR_MESSAGES[result.error] ?? VISITOR_MESSAGES.NETWORK })
      }
      void refresh()
    } catch (e) {
      setSheetError(messageFor(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelBooking() {
    if (!booking || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      const result = await cancelMyBooking(token, booking.code)
      seq.current++
      if (result.ok || result.error === 'NOT_FOUND') {
        clearSavedCode()
        setBooking(null)
        setConfirmCancel(false)
        setMessage({ tone: 'info', text: '예약을 취소했어요.' })
        window.scrollTo({ top: 0 })
      } else {
        setCancelError(VISITOR_MESSAGES.NOT_CANCELLABLE)
        setConfirmCancel(false)
      }
      void refresh()
    } catch (e) {
      setCancelError(messageFor(e))
    } finally {
      setCancelling(false)
    }
  }

  function dismissBooking() {
    clearSavedCode()
    setBooking(null)
    setMessage(null)
  }

  // ---------- 화면 ----------
  let content
  if (loadError && !state) {
    content = (
      <Notice tone="error" action={<Button onClick={() => { setLoadError(null); void refresh() }}>다시 시도</Button>}>
        {loadError}
      </Notice>
    )
  } else if (!state) {
    content = <p className="py-16 text-center text-lg text-slate-500">불러오는 중…</p>
  } else if (booking) {
    // 상태 C: 내 예약
    const canCancel = booking.status === 'booked'
    const done = booking.status === 'checked_in'
    content = (
      <div className="flex flex-col gap-5">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Ticket booking={booking} />
        <div className="rounded-2xl bg-slate-50 px-5 py-4 text-base leading-relaxed text-slate-800">
          <p className="font-bold text-ink">이 화면을 캡처해 두세요. 부스에서 코드를 보여주시면 됩니다.</p>
          <p className="mt-2">지정 시간 안에 와 주세요. 시간이 지나면 현장 대기 순서로 안내해 드려요.</p>
        </div>

        {cancelError && <Notice tone="error">{cancelError}</Notice>}

        {canCancel && !confirmCancel && (
          <Button variant="danger" onClick={() => { setCancelError(null); setConfirmCancel(true) }}>
            예약 취소
          </Button>
        )}
        {canCancel && confirmCancel && (
          <div className="rounded-2xl border-2 border-track-500 bg-white p-5">
            <p className="text-lg font-bold text-ink">예약을 취소할까요?</p>
            <p className="mt-1 text-base text-slate-600">취소하면 자리가 다른 분께 돌아가요.</p>
            <div className="mt-4 flex flex-col gap-3">
              <Button variant="danger" onClick={cancelBooking} disabled={cancelling} aria-busy={cancelling}>
                {cancelling ? '취소하는 중…' : '예약 취소'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
                돌아가기
              </Button>
            </div>
          </div>
        )}
        {done && (
          <Button variant="secondary" onClick={dismissBooking}>
            닫기
          </Button>
        )}
      </div>
    )
  } else if (!state.booking_open) {
    // 상태 A: 예약 접수 중지
    content = (
      <div className="flex flex-col gap-5">
        {message && message.tone === 'info' && <Notice tone="info">{message.text}</Notice>}
        <section className="rounded-3xl border-2 border-brand-600 bg-brand-50 px-6 py-8">
          <p className="text-[1.75rem] leading-snug font-extrabold text-brand-900">
            지금은 바로 체험하실 수 있어요.
          </p>
          <p className="mt-2 text-xl font-bold text-brand-700">{BOOTH.number}로 오세요.</p>
          <p className="mt-6 border-t-2 border-brand-100 pt-4 text-base font-semibold text-slate-700">
            {BOOTH.location} · <span className="whitespace-nowrap">{BOOTH.number}</span>
          </p>
        </section>
        {state.notice && <Notice tone="info">{state.notice}</Notice>}
      </div>
    )
  } else {
    // 상태 B: 예약 접수 중
    content = (
      <div className="flex flex-col gap-5">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {state.notice && <Notice tone="info">{state.notice}</Notice>}
        <div>
          <h2 className="text-xl font-bold text-ink">체험 시간 고르기</h2>
          <p className="mt-1 text-base leading-relaxed text-slate-600">
            지정 시간 안에 오시면 우선 체험하실 수 있어요. 기기 한 대당 1건만 예약돼요.
          </p>
        </div>
        {visibleSlots.length > 0 ? (
          <SlotList slots={visibleSlots} selectedId={selected?.id ?? null} onSelect={(s) => { setMessage(null); setSheetError(null); setSelected(s) }} />
        ) : (
          <Notice tone="info">
            예약할 수 있는 시간대가 남아 있지 않아요. {BOOTH.number}로 오시면 현장 대기 순서로 안내해 드려요.
          </Notice>
        )}
        <p className="text-sm text-slate-500">남은 자리는 15초마다 자동으로 바뀌어요.</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-white text-ink">
      <TrackStripe />
      <main className="mx-auto max-w-md px-4 pt-5 pb-12">
        <header className={booking ? 'mb-4' : 'mb-6'}>
          <p className="text-base font-bold text-track-600">
            {BOOTH.number} · 6층 그레이스홀 로비
          </p>
          {!booking && (
            <>
              <h1 className="mt-1 text-[1.625rem] leading-tight font-extrabold text-ink">
                {state?.booth_title ?? BOOTH.defaultTitle}
              </h1>
              <p className="mt-2 text-lg leading-relaxed text-slate-700">{BOOTH.description}</p>
            </>
          )}
          {booking && <h1 className="sr-only">내 예약</h1>}
        </header>

        {isDevTimeOverride() && (
          <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
            개발용 시각: {formatDateTime(now())} (화면 표시만 바뀜)
          </p>
        )}
        {connectionWarning && (
          <div className="mb-4">
            <Notice tone="warn">연결이 불안정해요. 화면 정보가 최신이 아닐 수 있어요.</Notice>
          </div>
        )}

        {content}

        <footer className="mt-10 border-t border-slate-200 pt-4 text-sm leading-relaxed text-slate-500">
          <p>{BOOTH.eventName}</p>
          <p>{BOOTH.organization} · 개인정보를 수집하지 않아요.</p>
        </footer>
      </main>

      {selected && !booking && state?.booking_open && (
        <ConfirmSheet
          slot={selected}
          submitting={submitting}
          error={sheetError}
          onConfirm={confirmBooking}
          onClose={closeSheet}
        />
      )}
    </div>
  )
}
