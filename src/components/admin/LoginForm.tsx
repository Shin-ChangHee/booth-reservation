import { useState, type FormEvent } from 'react'
import { BOOTH } from '../../lib/booth'
import { supabase } from '../../lib/supabase'
import { Button, Notice } from '../ui'
import { Logo } from '../Logo'

export function LoginForm({ notice, onSignedIn }: { notice: string | null; onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setError(/invalid/i.test(error.message) ? '이메일 또는 비밀번호가 맞지 않아요.' : `로그인하지 못했어요. (${error.message})`)
      } else {
        onSignedIn()
      }
    } catch {
      setError('연결이 불안정해요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Logo eager className="mb-6 h-10" />
      <p className="text-base font-bold text-track-600">{BOOTH.number} 스태프</p>
      <h1 className="mt-1 text-2xl font-extrabold">예약 관리 로그인</h1>
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4 rounded-2xl border-2 border-slate-200 bg-white p-5">
        {notice && <Notice tone="warn">{notice}</Notice>}
        <label className="flex flex-col gap-1.5 text-base font-semibold">
          이메일
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-14 rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-normal text-ink focus:border-brand-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-base font-semibold">
          비밀번호
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-14 rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-normal text-ink focus:border-brand-600 focus:outline-none"
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={submitting}>
          {submitting ? '로그인하는 중…' : '로그인'}
        </Button>
      </form>
    </main>
  )
}
