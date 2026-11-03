import type { AdminBooking, AdminSlot, BookingStatus } from '../../lib/api'
import { formatRange, formatTime } from '../../lib/time'

const small =
  'inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-xl px-4 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

function statusLabel(b: AdminBooking, slotEnded: boolean) {
  if (b.status === 'checked_in') return { text: '방문 완료', cls: 'bg-brand-100 text-brand-900' }
  if (b.status === 'cancelled') return { text: '취소', cls: 'bg-slate-200 text-slate-600' }
  if (slotEnded) return { text: '미방문', cls: 'bg-slate-100 text-slate-500' }
  return { text: '예약', cls: 'bg-orange-100 text-track-600' }
}

export function SlotCard({
  slot,
  isCurrent,
  isPast,
  expanded,
  busy,
  onToggleExpand,
  onCapacity,
  onToggleClosed,
  onSetStatus,
}: {
  slot: AdminSlot
  isCurrent: boolean
  isPast: boolean
  expanded: boolean
  busy: boolean
  onToggleExpand: () => void
  onCapacity: (capacity: number) => void
  onToggleClosed: () => void
  onSetStatus: (booking: AdminBooking, status: BookingStatus) => void
}) {
  const remaining = Math.max(slot.capacity - slot.active_count, 0)
  const listId = `slot-${slot.id}-bookings`
  const visibleCount = slot.bookings.length

  return (
    <section
      id={`slot-${slot.id}`}
      aria-label={formatRange(slot.starts_at, slot.ends_at)}
      className={`rounded-2xl border-2 bg-white ${
        isCurrent ? 'border-track-500 shadow-[0_0_0_4px_rgba(217,85,43,0.15)]' : slot.is_closed ? 'border-slate-200 bg-slate-50' : 'border-slate-200'
      } ${isPast && !isCurrent ? 'opacity-70' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <div className="min-w-44 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="tabular text-2xl font-extrabold tracking-tight">{formatRange(slot.starts_at, slot.ends_at)}</h3>
            {isCurrent && <span className="rounded-full bg-track-500 px-2.5 py-0.5 text-sm font-bold text-white">진행 중</span>}
            {slot.is_closed && <span className="rounded-full bg-slate-600 px-2.5 py-0.5 text-sm font-bold text-white">닫힘</span>}
          </div>
          <p className="tabular mt-1 text-base text-slate-700">
            정원 <strong className="text-ink">{slot.capacity}</strong> · 예약 <strong className="text-ink">{slot.active_count}</strong> · 방문{' '}
            <strong className="text-ink">{slot.checked_in_count}</strong>
            <span className={`ml-2 font-semibold ${remaining === 0 ? 'text-track-600' : 'text-brand-700'}`}>
              {remaining === 0 ? '만석' : `${remaining}자리 남음`}
            </span>
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="flex items-center rounded-xl border-2 border-slate-300" role="group" aria-label="정원">
            <button
              type="button"
              className={`${small} min-w-12 rounded-r-none px-0 text-xl text-ink hover:bg-slate-100`}
              aria-label="정원 줄이기"
              disabled={busy || slot.capacity <= 0}
              onClick={() => onCapacity(slot.capacity - 1)}
            >
              −
            </button>
            <span className="tabular min-w-10 text-center text-lg font-bold" aria-live="polite">
              {slot.capacity}
            </span>
            <button
              type="button"
              className={`${small} min-w-12 rounded-l-none px-0 text-xl text-ink hover:bg-slate-100`}
              aria-label="정원 늘리기"
              disabled={busy}
              onClick={() => onCapacity(slot.capacity + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`${small} border-2 ${slot.is_closed ? 'border-brand-600 text-brand-700 hover:bg-brand-50' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
            disabled={busy}
            onClick={onToggleClosed}
          >
            {slot.is_closed ? '열기' : '닫기'}
          </button>
          <button
            type="button"
            className={`${small} min-w-24 flex-1 bg-slate-100 text-ink hover:bg-slate-200 sm:flex-none`}
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={onToggleExpand}
          >
            예약 {visibleCount}건 <span aria-hidden="true" className="ml-1">{expanded ? '▴' : '▾'}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div id={listId} className="border-t-2 border-slate-100 px-4 py-3">
          {slot.bookings.length === 0 ? (
            <p className="py-2 text-base text-slate-500">예약이 없어요.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {slot.bookings.map((b) => {
                const label = statusLabel(b, isPast)
                const faded = b.status === 'cancelled' || (b.status === 'booked' && isPast)
                return (
                  <li key={b.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 ${faded ? 'text-slate-400' : ''}`}>
                    <span className={`tabular min-w-20 text-2xl font-extrabold tracking-wider ${b.status === 'cancelled' ? 'line-through' : ''}`}>
                      {b.code}
                    </span>
                    <span className="rounded-md border border-slate-300 px-2 py-0.5 text-sm font-semibold text-slate-600">
                      {b.source === 'walk_in' ? '현장' : 'QR'}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${label.cls}`}>{label.text}</span>
                    {b.checked_in_at && b.status === 'checked_in' && (
                      <span className="tabular text-sm text-slate-500">{formatTime(b.checked_in_at)} 방문</span>
                    )}
                    <span className="ml-auto flex gap-2">
                      {b.status === 'booked' && (
                        <>
                          <button
                            type="button"
                            className={`${small} bg-brand-600 text-white hover:bg-brand-700`}
                            disabled={busy}
                            onClick={() => onSetStatus(b, 'checked_in')}
                          >
                            방문 완료
                          </button>
                          <button
                            type="button"
                            className={`${small} border-2 border-track-500 text-track-600 hover:bg-orange-50`}
                            disabled={busy}
                            onClick={() => onSetStatus(b, 'cancelled')}
                          >
                            취소
                          </button>
                        </>
                      )}
                      {b.status === 'checked_in' && (
                        <button type="button" className={`${small} text-slate-600 hover:bg-slate-100`} disabled={busy} onClick={() => onSetStatus(b, 'booked')}>
                          방문 취소
                        </button>
                      )}
                      {b.status === 'cancelled' && (
                        <button type="button" className={`${small} text-slate-600 hover:bg-slate-100`} disabled={busy} onClick={() => onSetStatus(b, 'booked')}>
                          되살리기
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
