import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Relay } from './Relay'

vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u-owner', display_name: 'เจ้าของ' }, ready: true }) }))

const json = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

const thread = (id: string, name: string) => ({
  id, finder_display_name: name, sighting_district: 'ลาดพร้าว', sighting_area_note: null,
  last_message: `สวัสดีจาก${name}`, last_message_at: '2026-10-02T00:00:00Z', last_message_mine: false, unread_count: 1,
})

function mockApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/threads')) return json({ items: [thread('t1', 'คุณฝน'), thread('t2', 'คุณต้น')] })
    if (url.includes('/read')) return json(null, 204)
    if (url.includes('/messages') && init?.method === 'POST') {
      return json({ id: 9, sender_display_name: 'เจ้าของ', body: 'ขอบคุณ', created_at: '2026-10-02T01:00:00Z' }, 201)
    }
    if (url.includes('/messages')) {
      const tid = new URL(url, 'http://x').searchParams.get('thread_id')
      return json({ items: [{ id: 1, sender_display_name: tid === 't2' ? 'คุณต้น' : 'คุณฝน', body: `ข้อความใน ${tid}`, created_at: '2026-10-02T00:00:00Z' }] })
    }
    return json({ id: 'r1', pet_name: 'โกโก้', is_owner: true, status: 'HAS_LEAD' })
  })
}

describe('Relay', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('เจ้าของเลือกผู้พบเห็นคนที่สองแล้วตอบ — ข้อความถูกส่งพร้อม thread_id ของคนนั้น', async () => {
    const spy = mockApi()
    render(
      <MemoryRouter initialEntries={['/reports/r1/messages']}>
        <Routes><Route path="/reports/:id/messages" element={<Relay />} /></Routes>
      </MemoryRouter>,
    )
    await userEvent.click(await screen.findByRole('button', { name: /คุณต้น/ }))
    await screen.findByText('ข้อความใน t2')
    await userEvent.type(screen.getByLabelText('พิมพ์ข้อความ'), 'ขอบคุณ')
    await userEvent.click(screen.getByRole('button', { name: 'ส่ง' }))

    await waitFor(() => {
      const post = spy.mock.calls.find(([u, i]) => String(u).endsWith('/messages') && i?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(String(post![1]!.body))).toEqual({ body: 'ขอบคุณ', thread_id: 't2' })
    })
    // เปิดอ่านบทสนทนานั้นแล้ว = บอกเซิร์ฟเวอร์ว่าอ่านแล้ว (ล้างจุดแดง)
    expect(spy.mock.calls.some(([u, i]) => String(u).endsWith('/threads/t2/read') && i?.method === 'POST')).toBe(true)
  })
})
