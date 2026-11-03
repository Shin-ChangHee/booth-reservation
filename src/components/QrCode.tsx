import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** 주소를 QR코드(SVG)로 그린다. 인쇄해도 선명하도록 벡터로 출력. */
export function QrCode({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null))
    return () => {
      alive = false
    }
  }, [value])

  return (
    <div
      role="img"
      aria-label={label}
      className={`bg-white [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${className}`}
      // qrcode 라이브러리가 만든 SVG (입력은 우리 주소뿐)
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}
