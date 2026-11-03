import logoUrl from '../assets/kspo-logo.jpg'

/** 국민체육진흥공단 로고 (흰 배경 위에만 사용) */
export function Logo({ className = '', eager = false }: { className?: string; eager?: boolean }) {
  return (
    <img
      src={logoUrl}
      alt="국민체육진흥공단 KSPO"
      width={650}
      height={290}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`block w-auto select-none ${className}`}
      draggable={false}
    />
  )
}
