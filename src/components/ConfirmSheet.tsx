import { useEffect, useRef } from 'react'
import type { PublicSlot } from '../lib/api'
import { formatRange } from '../lib/time'
import { Button } from './ui'

export function ConfirmSheet({
  slot,
  submitting,
  error,
  onConfirm,
  onClose,
}: {
  slot: PublicSlot
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/50" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-t-3xl bg-white px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold text-slate-600">선택한 시간대</p>
        <h2 id="confirm-title" className="mt-1 text-2xl leading-snug font-bold">
          <span className="tabular text-brand-700">{formatRange(slot.starts_at, slot.ends_at)}</span>에 예약할까요?
        </h2>
        <p className="mt-2 text-base text-slate-600">지정 시간 안에 1번 부스로 오시면 우선 체험하실 수 있어요.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border-l-4 border-track-500 bg-orange-50 px-4 py-3 text-base font-semibold text-track-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Button ref={confirmRef} onClick={onConfirm} disabled={submitting} aria-busy={submitting}>
            {submitting ? '예약하는 중…' : error ? '다시 시도' : '예약하기'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            다른 시간 고르기
          </Button>
        </div>
      </div>
    </div>
  )
}
