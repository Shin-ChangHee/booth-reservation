/**
 * 시각 표시(Asia/Seoul)와 "현재 시각" 관리.
 *
 * - 휴대폰 시계가 틀려도 시간대 경과가 맞게 보이도록, 서버가 알려준 시각으로 보정한다.
 * - 개발 모드에서만 `?now=2026-11-17T14:25` 쿼리로 화면의 현재 시각을 바꿀 수 있다 (KST로 해석).
 *   서버 검증은 실제 시각 기준이므로, 화면 표시만 바뀐다.
 */

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const formatTime = (iso: string | number) => timeFormat.format(new Date(iso))
export const formatRange = (startIso: string, endIso: string) => `${formatTime(startIso)} – ${formatTime(endIso)}`
export const formatDateTime = (ms: number) => dateTimeFormat.format(new Date(ms))

let offsetMs = 0
let devOverride = false

function parseKst(value: string): number {
  // 시간대 표기가 없으면 KST로 간주
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
  return Date.parse(hasZone ? value : `${value}${value.length <= 16 ? ':00' : ''}+09:00`)
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const param = new URLSearchParams(window.location.search).get('now')
  if (param) {
    const t = parseKst(param)
    if (!Number.isNaN(t)) {
      offsetMs = t - Date.now()
      devOverride = true
    }
  }
}

/** 보정된 현재 시각 (ms) */
export const now = () => Date.now() + offsetMs

/** 개발용 시각 조작 중인지 */
export const isDevTimeOverride = () => devOverride

/** 서버 응답의 now 값으로 휴대폰 시계 오차를 보정한다 (개발용 시각 조작 중에는 무시). */
export function syncServerTime(serverIso: string | undefined) {
  if (devOverride || !serverIso) return
  const server = Date.parse(serverIso)
  if (!Number.isNaN(server)) offsetMs = server - Date.now()
}
