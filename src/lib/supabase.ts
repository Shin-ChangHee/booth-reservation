import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** .env가 비어 있으면 null. 화면은 이 경우 "설정 필요" 상태로 동작한다. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
