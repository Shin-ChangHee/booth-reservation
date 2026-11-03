import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Dashboard } from '../components/admin/Dashboard'
import { LoginForm } from '../components/admin/LoginForm'
import { Notice, TrackStripe } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signOut(message?: string) {
    setNotice(message ?? null)
    await supabase?.auth.signOut()
    setSession(null)
  }

  let content
  if (!supabase) {
    content = (
      <div className="mx-auto max-w-md px-4 py-10">
        <Notice tone="error">.env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 넣고 다시 실행해 주세요.</Notice>
      </div>
    )
  } else if (session === undefined) {
    content = <p className="py-16 text-center text-lg text-slate-500">불러오는 중…</p>
  } else if (!session) {
    content = <LoginForm notice={notice} onSignedIn={() => setNotice(null)} />
  } else {
    content = <Dashboard onSignOut={signOut} />
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-ink">
      <TrackStripe />
      {content}
    </div>
  )
}
