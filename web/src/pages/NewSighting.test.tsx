import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewSighting } from './NewSighting'

describe('NewSighting', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('เมื่อได้ 409 ต้องแสดงข้อความและข้อความที่พิมพ์ไว้ยังอยู่', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ code: 'REPORT_CLOSED', message_th: 'เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส', field: null }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ) as Response)

    render(<NewSighting reportId="r1" />)
    await userEvent.type(screen.getByLabelText('รายละเอียดที่พบ'), 'เห็นแมวแถวตลาด')
    await userEvent.type(screen.getByLabelText('เขต'), 'บางกะปิ')
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเบาะแส' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ปิดรับเบาะแส'))
    expect(screen.getByLabelText('รายละเอียดที่พบ')).toHaveValue('เห็นแมวแถวตลาด')
    expect(screen.getByRole('link', { name: /ประกาศอื่น/ })).toBeInTheDocument()
  })

  it('ส่งซ้ำด้วย Idempotency-Key เดิมเมื่อกดปุ่มสองครั้ง', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ id: 's1' }), { status: 201, headers: { 'content-type': 'application/json' } },
    ) as Response)

    render(<NewSighting reportId="r1" />)
    await userEvent.type(screen.getByLabelText('เขต'), 'บางกะปิ')
    const button = screen.getByRole('button', { name: 'ส่งเบาะแส' })
    await userEvent.click(button)
    await userEvent.click(button)

    const keys = spy.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(spy).toHaveBeenCalledTimes(2)          // ครั้งที่สองต้องถูกส่งจริง ไม่ใช่ถูกเมินแล้วผ่านเพราะมี key เดียว
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })

  it('ฟอร์มของประกาศคนละอัน (key ต่างกัน) ต้องได้ Idempotency-Key ต่างกัน', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(
      JSON.stringify({ id: 's' }), { status: 201, headers: { 'content-type': 'application/json' } },
    ))

    const { rerender } = render(<NewSighting key="A" reportId="A" />)
    await userEvent.type(screen.getByLabelText('เขต'), 'บางกะปิ')
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเบาะแส' }))

    rerender(<NewSighting key="B" reportId="B" />)          // เปลี่ยนประกาศ = mount ใหม่ = key ใหม่
    expect(screen.getByLabelText('เขต')).toHaveValue('')     // ฟอร์มถูกรีเซ็ต
    await userEvent.type(screen.getByLabelText('เขต'), 'ห้วยขวาง')
    await userEvent.click(screen.getByRole('button', { name: 'ส่งเบาะแส' }))

    const calls = spy.mock.calls.map(([url, init]) => [String(url), new Headers(init?.headers).get('Idempotency-Key')])
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toContain('/reports/A/')
    expect(calls[1][0]).toContain('/reports/B/')
    expect(calls[0][1]).not.toBe(calls[1][1])
  })
})
