/** QR코드에 넣을 관람객 예약 페이지 주소 */
export function getPublicUrl(): string {
  const fromEnv = import.meta.env.VITE_PUBLIC_URL?.trim()
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`
  return `${window.location.origin}/`
}

/** 휴대폰에서 열 수 없는 주소(localhost, 사설 IP)인지 */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    )
  } catch {
    return true
  }
}
