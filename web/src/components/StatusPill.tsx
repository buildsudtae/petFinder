import type { ReactElement } from 'react'

import type { Status } from '../api/endpoints'
import { STATUS_TH } from '../lib/labels'

// สถานะสื่อสารด้วย 4 สัญญาณพร้อมกัน: ข้อความไทย + icon + รูปกรอบ (ทึบ / ทึบ+มุมพับ / เส้นประ) + สี
const ICON: Record<Status, ReactElement> = {
  SEARCHING: (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  HAS_LEAD: (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M10 18s6-5.2 6-10a6 6 0 10-12 0c0 4.800 6 10 6 10z" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="8" r="2" fill="currentColor" />
    </svg>
  ),
  RESOLVED: (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 10.300l2.800 2.800L14 7.500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill pill-${status}`} data-status={status}>
      {ICON[status]}
      <span>{STATUS_TH[status]}</span>
    </span>
  )
}
