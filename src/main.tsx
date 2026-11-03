import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import './index.css'
import Visitor from './pages/Visitor.tsx'

// 관람객 화면(/)만 기본 번들에 넣고, 나머지는 필요할 때 불러온다 (휴대폰 첫 로딩을 가볍게)
const Admin = lazy(() => import('./pages/Admin.tsx'))
const Board = lazy(() => import('./pages/Board.tsx'))
const Poster = lazy(() => import('./pages/Poster.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p className="py-16 text-center text-lg text-slate-500">불러오는 중…</p>}>
        <Routes>
          <Route path="/" element={<Visitor />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/board" element={<Board />} />
          <Route path="/poster" element={<Poster />} />
          <Route path="*" element={<Visitor />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
