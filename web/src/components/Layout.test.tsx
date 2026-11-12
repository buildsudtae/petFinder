import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NOTIFICATIONS_CHANGED } from '../api/endpoints'
import { Layout } from './Layout'

const logout = vi.fn(async () => undefined)
vi.mock('../auth', () => ({ useAuth: () => ({ user: { id: 'u1', display_name: 'คุณฝน' }, ready: true, logout }) }))

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function renderAt(entry: string | { pathname: string; state: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route element={<Layout />}><Route path="*" element={<p>เนื้อหา</p>} /></Route></Routes>
    </MemoryRouter>,
  )
}

const note = (topic: string, read = false) =>
  ({ id: Math.random(), topic, report_id: 'r1', status_to: null, created_at: '2026-11-12T00:00:00Z', read })

describe('Layout', () => {
  let items = [note('sighting.created'), note('sighting.created')]
  beforeEach(() => {
    vi.restoreAllMocks()
    logout.mockClear()
    items = [note('sighting.created'), note('sighting.created')]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json({ items, unread_count: items.filter((n) => !n.read).length }))
  })

  it('เข้าสู่ระบบอยู่: header แสดงชื่อผู้ใช้ และ toast ยืนยันหลังเข้าสู่ระบบ', async () => {
    renderAt({ pathname: '/', state: { flash: 'เข้าสู่ระบบแล้วในชื่อ คุณฝน' } })
    expect(screen.getByRole('button', { name: 'บัญชีของ คุณฝน' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('เข้าสู่ระบบแล้วในชื่อ คุณฝน')
  })

  it('ออกจากระบบต้องยืนยันก่อน — ยกเลิกแล้วยังอยู่ในระบบ', async () => {
    renderAt('/')
    const acct = screen.getByRole('button', { name: 'บัญชีของ คุณฝน' })
    await userEvent.click(acct)
    expect(acct).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(acct.parentElement!).getByRole('button', { name: 'ออกจากระบบ' }))

    const dialog = screen.getByRole('alertdialog', { name: 'ออกจากระบบ?' })
    expect(dialog).toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()

    await userEvent.click(screen.getAllByRole('button', { name: 'ออกจากระบบ' })[0])   // ปุ่มท้ายหน้า
    await userEvent.click(screen.getAllByRole('button', { name: 'ออกจากระบบ' }).at(-1)!)   // ปุ่มยืนยันใน dialog
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('badge ลดทันทีเมื่อมีหน้าบอกว่าอ่านแจ้งเตือนแล้ว ไม่ต้องรอเปลี่ยนหน้า', async () => {
    renderAt('/')
    expect(await screen.findByLabelText('2 รายการใหม่')).toBeInTheDocument()
    items = items.map((n) => ({ ...n, read: true }))
    act(() => { window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)) })
    await waitFor(() => expect(screen.queryByLabelText(/รายการใหม่/)).not.toBeInTheDocument())
  })

  it('badge ของ "ประกาศของฉัน" ไม่นับแจ้งเตือนของผู้พบเห็น ที่หน้านั้นไม่แสดงและล้างไม่ได้', async () => {
    items = [note('report.status_changed'), note('sighting.created')]
    renderAt('/')
    expect(await screen.findByLabelText('1 รายการใหม่')).toBeInTheDocument()
  })
})
