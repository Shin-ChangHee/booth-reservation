/**
 * 예약 페이지 주소 → 인쇄용 QR코드 이미지 생성
 *
 *   npm run make-qr -- https://booth-booking.vercel.app/
 *   (주소를 생략하면 .env의 VITE_PUBLIC_URL 사용)
 *
 * 출력: public/qr.png (2000px, 인쇄용), public/qr.svg (벡터)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const url = (process.argv[2] ?? process.env.VITE_PUBLIC_URL ?? '').trim()

if (!url) {
  console.error('주소를 넣어 주세요. 예) npm run make-qr -- https://booth-booking.vercel.app/')
  process.exit(1)
}
try {
  const u = new URL(url)
  if (u.protocol !== 'https:') console.warn(`주의: https 주소가 아니에요 (${u.protocol}). 배포 주소인지 확인하세요.`)
  if (/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) console.warn('주의: 휴대폰에서 열 수 없는 주소예요 (localhost/사설 IP).')
} catch {
  console.error(`올바른 주소가 아니에요: ${url}`)
  process.exit(1)
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(outDir, { recursive: true })

const options = { errorCorrectionLevel: 'M' as const, margin: 4, color: { dark: '#0f172a', light: '#ffffff' } }

const png = await QRCode.toBuffer(url, { ...options, type: 'png', width: 2000 })
writeFileSync(resolve(outDir, 'qr.png'), png)

const svg = await QRCode.toString(url, { ...options, type: 'svg' })
writeFileSync(resolve(outDir, 'qr.svg'), svg)

console.log(`QR 생성 완료: ${url}`)
console.log(`  public/qr.png (2000×2000px)`)
console.log(`  public/qr.svg`)
