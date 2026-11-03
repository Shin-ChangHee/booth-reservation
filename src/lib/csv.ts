import type { AdminSlot } from './api'
import { formatRange } from './time'

const escape = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 시간대별 통계 CSV (개인정보 없음). 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. */
export function buildStatsCsv(slots: AdminSlot[]): string {
  const header = ['시간대', '정원', '예약', '방문', '취소', '현장 등록', '닫힘']
  const rows = slots.map((s) => [
    formatRange(s.starts_at, s.ends_at),
    s.capacity,
    s.active_count,
    s.checked_in_count,
    s.cancelled_count,
    s.walk_in_count,
    s.is_closed ? 'Y' : '',
  ])
  const sum = (k: keyof AdminSlot) => slots.reduce((acc, s) => acc + (s[k] as number), 0)
  rows.push(['합계', sum('capacity'), sum('active_count'), sum('checked_in_count'), sum('cancelled_count'), sum('walk_in_count'), ''])
  return '﻿' + [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
