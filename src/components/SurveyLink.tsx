import { BOOTH } from '../lib/booth'

/** 만족도 조사 (외부 링크, 새 창) */
export function SurveyLink({ variant = 'block', className = '' }: { variant?: 'block' | 'inline'; className?: string }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
  const styles =
    variant === 'block'
      ? 'min-h-14 w-full rounded-2xl bg-brand-600 px-5 text-lg text-white hover:bg-brand-700 active:bg-brand-900'
      : 'min-h-12 rounded-xl border-2 border-brand-600 bg-white px-4 text-base text-brand-700 hover:bg-brand-50 active:bg-brand-100'
  return (
    <a href={BOOTH.surveyUrl} target="_blank" rel="noopener noreferrer" className={`${base} ${styles} ${className}`}>
      만족도 조사 참여하기
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 shrink-0">
        <path d="M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">(새 창에서 열림)</span>
    </a>
  )
}
