import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  // 배포 환경(Vercel/Netlify/CI)에서 Supabase 설정 없이 빌드되면 "설정 필요" 화면이 배포되므로 빌드를 막는다.
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k])
    const deploying = !!(process.env.CI || process.env.VERCEL || process.env.NETLIFY)
    if (missing.length && deploying) {
      throw new Error(`환경변수가 없어요: ${missing.join(', ')} — 배포 서비스의 환경변수 설정에 넣어 주세요.`)
    }
    if (missing.length) console.warn(`[경고] ${missing.join(', ')} 없음 — 이 빌드는 "설정 필요" 화면만 보여요.`)
  }
  return { plugins: [react(), tailwindcss()] }
})
