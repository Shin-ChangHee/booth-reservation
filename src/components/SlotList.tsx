import type { PublicSlot } from '../lib/api'
import { formatRange } from '../lib/time'

export function SlotList({
  slots,
  selectedId,
  onSelect,
}: {
  slots: PublicSlot[]
  selectedId: number | null
  onSelect: (slot: PublicSlot) => void
}) {
  return (
    <ul className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white">
      {slots.map((slot) => {
        const full = slot.remaining <= 0
        const selected = slot.id === selectedId
        return (
          <li key={slot.id} className="border-b border-slate-200 last:border-b-0">
            <button
              type="button"
              disabled={full}
              onClick={() => onSelect(slot)}
              aria-label={`${formatRange(slot.starts_at, slot.ends_at)}, ${full ? '마감' : `${slot.remaining}자리 남음`}`}
              className={`flex min-h-16 w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-brand-500 ${
                full
                  ? 'cursor-not-allowed bg-slate-50 text-slate-400'
                  : selected
                    ? 'bg-brand-50 text-ink'
                    : 'text-ink hover:bg-brand-50 active:bg-brand-100'
              }`}
            >
              <span className="tabular text-xl font-bold tracking-tight">{formatRange(slot.starts_at, slot.ends_at)}</span>
              {full ? (
                <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-base font-bold text-slate-500">마감</span>
              ) : (
                <span
                  className={`tabular shrink-0 rounded-full px-3 py-1 text-base font-bold ${
                    slot.remaining === 1 ? 'bg-orange-100 text-track-600' : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  {slot.remaining}자리 남음
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
