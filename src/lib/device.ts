/**
 * 기기 식별용 무작위 값(device_token)과 내 예약 코드 저장.
 * 개인정보가 아니며, localStorage를 못 쓰는 환경(사생활 보호 모드 등)에서는 메모리 값으로 동작한다.
 */

const TOKEN_KEY = 'booth.device_token'
const CODE_KEY = 'booth.booking_code'
const memory = new Map<string, string>()

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key)
    if (v !== null) return v
  } catch {
    // 저장소 접근 불가 → 메모리 사용
  }
  return memory.get(key) ?? null
}

function write(key: string, value: string) {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 무시
  }
}

function remove(key: string) {
  memory.delete(key)
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 무시
  }
}

function randomToken(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // randomUUID는 https에서만 동작 → 개발용 http 접속 대비
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getDeviceToken(): string {
  let token = read(TOKEN_KEY)
  if (!token || token.length < 16 || token.length > 128) {
    token = randomToken()
    write(TOKEN_KEY, token)
  }
  return token
}

export const getSavedCode = () => read(CODE_KEY)
export const saveCode = (code: string) => write(CODE_KEY, code)
export const clearSavedCode = () => remove(CODE_KEY)
