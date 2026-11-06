import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Login } from './Login'

const setUser = vi.fn()
vi.mock('../auth', () => ({ useAuth: () => ({ user: null, ready: true, setUser }) }))

const reply = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function Landing() {
  const flash = (useLocation().state as { flash?: string } | null)?.flash
  return <p>หน้าแรก · {flash}</p>
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Login', () => {
  beforeEach(() => { vi.restoreAllMocks(); setUser.mockReset() })

  it('รหัสผิด: แสดงข้อความรวมไม่บอกว่าผิดช่องไหน และพากลับไปช่องอีเมล', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ code: 'INVALID_CREDENTIALS', message_th: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, 401))
    renderLogin()
    await userEvent.type(screen.getByLabelText('อีเมล'), 'someone@example.com')
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'not-the-password')
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    expect(screen.getByLabelText('อีเมล')).toHaveFocus()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('เข้าสู่ระบบได้: ส่งข้อความยืนยันพร้อมชื่อไปหน้าถัดไป (ให้รู้ตัวว่าเข้าสู่ระบบอยู่)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ id: 'u1', display_name: 'คุณฝน' }, 200))
    renderLogin()
    await userEvent.type(screen.getByLabelText('อีเมล'), 'someone@example.com')
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'whatever-typed')
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))

    expect(await screen.findByText('หน้าแรก · เข้าสู่ระบบแล้วในชื่อ คุณฝน')).toBeInTheDocument()
    expect(setUser).toHaveBeenCalledWith({ id: 'u1', display_name: 'คุณฝน' })
  })
})
