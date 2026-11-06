import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewReport } from './NewReport'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('NewReport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ items: [] }))   // ยังไม่มีสัตว์เลี้ยง → เพิ่มตัวใหม่
  })

  it('ขั้นที่ 1 ไปต่อไม่ได้ถ้ายังไม่ใส่ชื่อสัตว์ และบอกว่าต้องแก้ช่องไหน', async () => {
    render(<MemoryRouter><NewReport /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'ถัดไป' }))

    expect(await screen.findByText('ใส่ชื่อสัตว์เลี้ยง')).toBeInTheDocument()
    expect(screen.getByText('ขั้น 1 จาก 3')).toBeInTheDocument()
  })

  it('ขั้นที่ 2 ต้องมีเขต แล้วขั้นที่ 3 สรุปให้ตรวจก่อนประกาศ', async () => {
    render(<MemoryRouter><NewReport /></MemoryRouter>)
    await userEvent.type(await screen.findByLabelText(/^ชื่อ/), 'ส้มจี๊ด')
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByText('ขั้น 2 จาก 3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByText('เลือกเขตที่หาย')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^เขต/), 'บางกะปิ')
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(await screen.findByText('ขั้น 3 จาก 3')).toBeInTheDocument()
    expect(screen.getByText(/หายที่บางกะปิ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ประกาศตามหา' })).toBeInTheDocument()
  })
})
