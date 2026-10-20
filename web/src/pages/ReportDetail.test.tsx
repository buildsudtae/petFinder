import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportDetail } from './ReportDetail'

vi.mock('../auth', () => ({ useAuth: () => ({ user: null, ready: true }) }))

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
})

const report = (isOwner: boolean) => ({
  id: 'r1', status: 'SEARCHING', pet_name: 'ขาวมณี', species: 'cat', color: null, marks: null,
  last_seen_at: '2026-10-01T00:00:00Z', district: 'บางกะปิ', area_note: null, description: null,
  sighting_count: 1, created_at: '2026-10-01T00:00:00Z', is_owner: isOwner,
})

const sighting = (over: object) => ({
  id: 's1', finder_display_name: 'ผู้พบ', photo_url: null, thumb_url: null,
  seen_at: '2026-10-02T00:00:00Z', district: 'บางกะปิ', area_note: null, note: null,
  created_at: '2026-10-02T00:00:00Z', ...over,
})

function mockApi(isOwner: boolean, sightings: object[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    if (url.endsWith('/sightings')) return json({ items: sightings })
    if (url.endsWith('/events')) {
      return json({ items: [{ from_status: 'SEARCHING', to_status: 'RESOLVED', reason: 'เหตุผลส่วนตัว', created_at: '2026-10-02T00:00:00Z' }] })
    }
    return json(report(isOwner))
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/r1']}>
      <Routes><Route path="/reports/:id" element={<ReportDetail />} /></Routes>
    </MemoryRouter>,
  )
}

describe('ReportDetail', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('เบาะแสที่ thumb_url เป็น null (worker ยังไม่ทำ thumbnail) ยังต้องแสดงรูปเต็ม', async () => {
    mockApi(false, [sighting({ photo_url: '/uploads/full.jpg', thumb_url: null })])
    renderPage()
    const img = await screen.findByRole('img', { name: /ภาพที่ ผู้พบ/ })
    expect(img).toHaveAttribute('src', '/uploads/full.jpg')
  })

  it('มี thumb_url ใช้ thumbnail เป็นรูป และลิงก์ไปรูปเต็ม', async () => {
    mockApi(false, [sighting({ photo_url: '/uploads/full.jpg', thumb_url: '/uploads/t.jpg' })])
    renderPage()
    const img = await screen.findByRole('img', { name: /ภาพที่ ผู้พบ/ })
    expect(img).toHaveAttribute('src', '/uploads/t.jpg')
  })

  it('ผู้ที่ไม่ใช่เจ้าของต้องไม่ขอ /events และไม่เห็นเหตุผล', async () => {
    const spy = mockApi(false, [])
    renderPage()
    await screen.findByText('ขาวมณี')
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/events'))).toBe(false)
    expect(screen.queryByText(/เหตุผลส่วนตัว/)).not.toBeInTheDocument()
  })

  it('เจ้าของขอ /events และเห็นประวัติสถานะ', async () => {
    const spy = mockApi(true, [])
    renderPage()
    await waitFor(() => expect(screen.getByText(/เหตุผลส่วนตัว/)).toBeInTheDocument())
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/events'))).toBe(true)
  })
})
