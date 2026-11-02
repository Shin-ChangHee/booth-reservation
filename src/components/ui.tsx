import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-slate-300 disabled:text-slate-600',
  secondary: 'bg-white text-brand-700 border-2 border-brand-600 hover:bg-brand-50 active:bg-brand-100 disabled:border-slate-300 disabled:text-slate-500',
  danger: 'bg-white text-track-600 border-2 border-track-500 hover:bg-orange-50 active:bg-orange-100 disabled:border-slate-300 disabled:text-slate-500',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 text-lg font-bold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

type Tone = 'info' | 'error' | 'warn'

const tones: Record<Tone, string> = {
  info: 'border-brand-600 bg-brand-50 text-brand-900',
  error: 'border-track-500 bg-orange-50 text-track-600',
  warn: 'border-amber-500 bg-amber-50 text-amber-900',
}

export function Notice({ tone = 'info', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`rounded-xl border-l-4 px-4 py-3 text-base font-semibold leading-relaxed ${tones[tone]}`}>
      <div>{children}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/** 경기장 트랙을 닮은 상단 띠 */
export function TrackStripe() {
  return (
    <div aria-hidden="true">
      <div className="h-2 bg-brand-600" />
      <div className="h-0.5 bg-white" />
      <div className="h-1 bg-track-500" />
    </div>
  )
}
