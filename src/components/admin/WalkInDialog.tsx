import { useEffect, useMemo, useState } from 'react'
import { adminWalkIn, ADMIN_MESSAGES, ApiError, type AdminBookingDetail, type AdminSlot } from '../../lib/api'
import { formatRange, now } from '../../lib/time'
import { Button, Notice } from '../ui'

export function WalkInDialog({
  slots,
  onClose,
  onDone,
  onUnauthorized,
}: {
  slots: AdminSlot[]
  onClose: () => void
  onDone: () => void
  onUnauthorized: () => void
}) {
  // 끝나지 않은 시간대만 (진행 중 포함)
  const options = useMemo(() => {
    const t = now()
    return slots.filter((s) => Date.parse(s.ends_at) > t)
  }, [slots])

  const defaultId = useMemo(() => {
    const open = options.find((s) => !s.is_closed && s.active_count < s.capacity)
    return (open ?? options[0])?.id ?? null
  }, [options])

  const [slotId, setSlotId] = useState<number | null>(defaultId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsForce, setNeedsForce] = useState(false)
  const [created, setCreated] = useState<AdminBookingDetail | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !submitting && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function submit(force: boolean) {
    if (slotId == null || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await adminWalkIn(slotId, force)
      if (r.ok) {
        setCreated(r.booking)
        setNeedsForce(false)
        onDone()
      } else if (r.error === 'SLOT_FULL' || r.error === 'SLOT_CLOSED') {
        setNeedsForce(true)
        setError(`${ADMIN_MESSAGES[r.error]} 그래도 등록할까요?`)
      } else {
        setError(ADMIN_MESSAGES[r.error] ?? r.error)
      }
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'UNAUTHORIZED') return onUnauthorized()
      setError(ADMIN_MESSAGES.NETWORK)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/50 sm:items-center" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkin-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-ink shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b-2 border-slate-100 px-5 pt-5 pb-4">
          <h2 id="walkin-title" className="text-2xl font-extrabold">현장 등록</h2>
          <p className="mt-1 text-base text-slate-600">휴대폰이 없는 분이나 종이 카드를 받은 분을 시간대에 직접 넣어요.</p>
        </div>

        {created ? (
          <div className="px-5 py-6">
            <p className="text-base font-semibold text-slate-600">등록 완료 · 확인코드</p>
            <p className="tabular mt-1 text-6xl font-extrabold tracking-[0.15em] text-brand-900">{created.code}</p>
            <p className="tabular mt-2 text-xl font-bold">{formatRange(created.starts_at, created.ends_at)}</p>
            <p className="mt-3 text-base text-slate-600">종이 카드에 이 코드를 적어 드리세요.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => { setCreated(null); setError(null) }}>
                하나 더 등록
              </Button>
              <Button onClick={onClose}>닫기</Button>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="flex-1 overflow-y-auto px-5 py-3">
              <legend className="sr-only">시간대 선택</legend>
              {options.length === 0 && <p className="py-4 text-base text-slate-500">남은 시간대가 없어요.</p>}
              {options.map((s) => {
                const remaining = Math.max(s.capacity - s.active_count, 0)
                return (
                  <label
                    key={s.id}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 ${slotId === s.id ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                  >
                    <input
                      type="radio"
                      name="walkin-slot"
                      className="size-5 accent-brand-600"
                      checked={slotId === s.id}
                      onChange={() => { setSlotId(s.id); setNeedsForce(false); setError(null) }}
                    />
                    <span className="tabular text-lg font-bold">{formatRange(s.starts_at, s.ends_at)}</span>
                    <span className={`tabular ml-auto text-base font-semibold ${s.is_closed ? 'text-slate-500' : remaining === 0 ? 'text-track-600' : 'text-brand-700'}`}>
                      {s.is_closed ? '닫힘' : remaining === 0 ? '만석' : `${remaining}자리`}
                    </span>
                  </label>
                )
              })}
            </fieldset>
            <div className="flex flex-col gap-3 border-t-2 border-slate-100 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {error && <Notice tone={needsForce ? 'warn' : 'error'}>{error}</Notice>}
              {needsForce ? (
                <Button variant="danger" onClick={() => submit(true)} disabled={submitting}>
                  {submitting ? '등록하는 중…' : '정원 넘겨서 등록'}
                </Button>
              ) : (
                <Button onClick={() => submit(false)} disabled={submitting || slotId == null}>
                  {submitting ? '등록하는 중…' : '현장 등록'}
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                닫기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
