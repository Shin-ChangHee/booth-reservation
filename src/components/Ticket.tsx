import type { MyBooking } from '../lib/api'
import { BOOTH } from '../lib/booth'
import { formatRange, now } from '../lib/time'

/** 캡처해서 보여주는 예약 확인 화면의 핵심 카드 */
export function Ticket({ booking }: { booking: MyBooking }) {
  const t = now()
  const started = Date.parse(booking.starts_at) <= t
  const ended = Date.parse(booking.ends_at) <= t
  const checkedIn = booking.status === 'checked_in'

  const label = checkedIn ? '방문 완료' : '예약 완료'

  return (
    <section aria-label="내 예약" className="overflow-hidden rounded-3xl border-2 border-brand-600 bg-white shadow-[0_10px_30px_-12px_rgba(11,99,206,0.45)]">
      {/* 상단: 시간대 */}
      <div className="relative bg-brand-600 px-6 pt-5 pb-6 text-white">
        <div className="flex items-center justify-between text-base font-bold">
          <span className="rounded-full bg-white/15 px-3 py-1">{label}</span>
          <span>{BOOTH.number}</span>
        </div>
        <p className="mt-5 text-base font-semibold text-brand-100">체험 시간</p>
        <p className="tabular mt-1 text-[2.75rem] leading-none font-extrabold tracking-tight">
          {formatRange(booking.starts_at, booking.ends_at)}
        </p>
        {/* 트랙 라인 */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0">
          <div className="h-1 bg-track-500" />
        </div>
      </div>

      {/* 절취선 */}
      <div aria-hidden="true" className="relative h-0">
        <div className="absolute -top-3 -left-3 size-6 rounded-full border-2 border-brand-600 bg-white" />
        <div className="absolute -top-3 -right-3 size-6 rounded-full border-2 border-brand-600 bg-white" />
      </div>

      {/* 하단: 확인코드 */}
      <div className="px-6 pt-6 pb-6">
        <p className="text-base font-semibold text-slate-600">확인코드</p>
        <p className="sr-only">{booking.code.split('').join(' ')}</p>
        <div aria-hidden="true" className="mt-2 flex gap-2.5">
          {booking.code.split('').map((ch, i) => (
            <span
              key={i}
              className="tabular flex h-20 flex-1 items-center justify-center rounded-2xl border-2 border-brand-100 bg-brand-50 text-5xl font-extrabold text-brand-900"
            >
              {ch}
            </span>
          ))}
        </div>
        <p className="mt-4 text-base leading-relaxed text-slate-700">
          {BOOTH.location} · <strong className="whitespace-nowrap text-ink">{BOOTH.number}</strong>
        </p>
      </div>

      {/* 상태 안내 */}
      {!checkedIn && started && !ended && (
        <p className="border-t-2 border-brand-100 bg-brand-50 px-6 py-3 text-base font-bold text-brand-900">
          지금이 예약하신 시간이에요. {BOOTH.number}로 와 주세요.
        </p>
      )}
      {!checkedIn && ended && (
        <p className="border-t-2 border-orange-200 bg-orange-50 px-6 py-3 text-base font-bold text-track-600">
          지정 시간이 지났어요. 부스로 오시면 현장 대기 순서로 안내해 드려요.
        </p>
      )}
      {checkedIn && (
        <p className="border-t-2 border-brand-100 bg-brand-50 px-6 py-3 text-base font-bold text-brand-900">
          방문 처리되었어요. 체험해 주셔서 감사합니다.
        </p>
      )}
    </section>
  )
}
