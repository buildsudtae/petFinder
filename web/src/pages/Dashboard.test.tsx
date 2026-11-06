import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './Dashboard'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const report = {
  id: 'r1', status: 'HAS_LEAD', pet_name: 'โกโก้', species: 'dog', color: null, marks: null, photo_url: null,
  last_seen_at: '2026-10-01T00:00:00Z', district: 'ลาดพร้าว', area_note: null, description: null,
  sighting_count: 3, is_owner: true, created_at: '2026-10-01T00:00:00Z',
}
const note = (id: number, read: boolean, reportId = 'r1') => ({
  id, topic: 'sighting.created', report_id: reportId, status_to: null, created_at: '2026-10-02T00:00:00Z', read,
})

describe('Dashboard', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('แสดงจำนวนเบาะแสใหม่จากแจ้งเตือนที่ยังไม่อ่านของประกาศนั้นเท่านั้น', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('/api/notifications')) {
        return json({ items: [note(1, false), note(2, false), note(3, true), note(4, false, 'r-other')], unread_count: 3 })
      }
      if (url.endsWith('/threads')) return json({ items: [] })
      return json({ items: [report], next_cursor: null })
    })
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(await screen.findByText('ใหม่ 2')).toBeInTheDocument()
    expect(screen.getByText(/3 เบาะแส/)).toBeInTheDocument()
  })
})
