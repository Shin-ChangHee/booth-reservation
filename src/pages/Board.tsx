import { useCallback, useEffect, useState } from 'react'
import { QrCode } from '../components/QrCode'
import { TrackStripe } from '../components/ui'
import { getPublicState, type PublicState } from '../lib/api'
import { BOOTH } from '../lib/booth'
import { getPublicUrl } from '../lib/publicUrl'
import { formatRange, formatTime, now, syncServerTime } from '../lib/time'
import { usePolling } from '../lib/usePolling'
import { Logo } from '../components/Logo'

const POLL_MS = 15_000

/** 거치형 태블릿이 꺼지지 않도록 화면 켜짐 유지 (지원하는 브라우저에서만) */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }
    let sentinel: Sentinel | null = null
    const request = () => {
      if (document.visibilityState !== 'visible' || !nav.wakeLock) return
      nav.wakeLock.request('screen').then((s) => (sentinel = s)).catch(() => {})
    }
    request()
    document.addEventListener('visibilitychange', request)
    return () => {
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release().catch(() => {})
    }
  }, [])
}

function Clock() {
  const [t, setT] = useState(now())
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return <span className="tabular">{formatTime(t)}</span>
}

export default function Board() {
  const [state, setState] = useState<PublicState | null>(null)
  const [offline, setOffline] = useState(false)
  const url = getPublicUrl()
  useWakeLock()

  const refresh = useCallback(async () => {
    try {
      const st = await getPublicState()
      syncServerTime(st.now)
      setState(st)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  usePolling(() => void refresh(), POLL_MS)

  const t = now()
  const slots = state?.slots ?? []
  const current = slots.find((s) => Date.parse(s.starts_at) <= t && t < Date.parse(s.ends_at)) ?? null
  const nextAvailable = slots.find((s) => Date.parse(s.starts_at) > t && s.remaining > 0) ?? null
  const open = state?.booking_open ?? false

  return (
    <div className="flex min-h-dvh flex-col bg-white text-ink">
      <TrackStripe />
      <header className="flex items-center justify-between gap-6 px-[4vw] pt-[3vh]">
        <div>
          <p className="text-[clamp(1.25rem,2.4vw,2rem)] font-bold text-track-600">{BOOTH.number}</p>
          <h1 className="text-[clamp(1.5rem,3.1vw,2.875rem)] leading-tight font-extrabold">{state?.booth_title ?? BOOTH.defaultTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-[2.5vw]">
          <Logo eager className="h-[clamp(2.75rem,min(8vh,7vw),5.5rem)]" />
          <p className="text-[clamp(2rem,4.5vw,4rem)] font-extrabold text-slate-700">
            <Clock />
          </p>
        </div>
      </header>

      {!state ? (
        <main className="flex flex-1 items-center justify-center text-3xl text-slate-500">{offline ? '연결을 기다리는 중…' : '불러오는 중…'}</main>
      ) : !open ? (
        // 접수 중지: 바로 체험
        <main className="flex flex-1 flex-col items-center justify-center px-[4vw] text-center">
          <p className="text-[clamp(3rem,9vw,8rem)] leading-none font-extrabold text-brand-600">지금 바로 체험 가능</p>
          <p className="mt-[3vh] text-[clamp(1.5rem,3.2vw,2.75rem)] font-bold text-slate-700">예약 없이 부스로 들어오세요.</p>
          <p className="mt-[2vh] text-[clamp(1.25rem,2.4vw,2rem)] text-slate-600">{BOOTH.description}</p>
        </main>
      ) : (
        <main className="grid flex-1 grid-cols-1 items-center gap-[4vh] px-[4vw] py-[3vh] landscape:grid-cols-[1.15fr_1fr] landscape:gap-[4vw]">
          <div className="flex flex-col gap-[3vh]">
            <section className="rounded-[2rem] border-4 border-track-500 px-[3vw] py-[3vh]">
              <p className="text-[clamp(1.25rem,2.6vw,2.25rem)] font-bold text-track-600">지금 체험 중</p>
              <p className="tabular mt-1 text-[clamp(2.5rem,5.4vw,6rem)] leading-none font-extrabold tracking-tight whitespace-nowrap portrait:text-[clamp(2.5rem,8.5vw,6rem)]">
                {current ? formatRange(current.starts_at, current.ends_at) : '—'}
              </p>
            </section>
            <section className="rounded-[2rem] bg-brand-600 px-[3vw] py-[3vh] text-white">
              <p className="text-[clamp(1.25rem,2.6vw,2.25rem)] font-bold text-brand-100">다음 예약 가능</p>
              {nextAvailable ? (
                <p className="tabular mt-1 text-[clamp(2.75rem,7vw,6.5rem)] leading-none font-extrabold tracking-tight">
                  {formatTime(nextAvailable.starts_at)}
                  <span className="ml-[0.4em] align-middle text-[0.45em] font-bold text-brand-100">({nextAvailable.remaining}자리)</span>
                </p>
              ) : (
                <p className="mt-2 text-[clamp(1.75rem,4vw,3.5rem)] leading-tight font-extrabold">오늘 예약이 모두 찼어요</p>
              )}
            </section>
          </div>

          <section className="flex flex-col items-center text-center">
            <QrCode value={url} label="예약 페이지 QR코드" className="aspect-square w-[min(38vw,46vh)] rounded-3xl border-4 border-slate-200 portrait:w-[min(60vw,30vh)]" />
            <p className="mt-[2vh] text-[clamp(1.5rem,3vw,2.75rem)] leading-snug font-extrabold">
              휴대폰 카메라로 찍고
              <br />
              체험 시간을 예약하세요
            </p>
            <p className="mt-1 text-[clamp(1rem,1.8vw,1.5rem)] text-slate-600">기다리지 않고 다른 부스를 둘러보다 오시면 돼요.</p>
          </section>
        </main>
      )}

      <footer className="flex items-center justify-between px-[4vw] pb-[2.5vh] text-[clamp(0.9rem,1.5vw,1.25rem)] text-slate-500">
        <span>{BOOTH.organization}</span>
        {offline && state && <span className="font-semibold text-amber-700">연결 확인 중 · 화면이 최신이 아닐 수 있어요</span>}
      </footer>
    </div>
  )
}
