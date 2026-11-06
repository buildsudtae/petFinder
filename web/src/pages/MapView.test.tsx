import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MapView } from './MapView'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const report = (id: string, name: string, district: string, status = 'SEARCHING') => ({
  id, status, pet_name: name, species: 'cat', color: null, marks: null, photo_url: null,
  last_seen_at: '2026-10-01T00:00:00Z', district, area_note: null, description: null,
  sighting_count: 0, is_owner: false, created_at: '2026-10-01T00:00:00Z',
})

describe('MapView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({
      items: [
        report('r1', 'ส้มจี๊ด', 'บางกะปิ'),
        report('r2', 'มอลลี่', 'เขตบางกะปิ', 'HAS_LEAD'),   // มีคำว่า "เขต" นำหน้า — ยังเป็นหมุดเดียวกัน
        report('r3', 'โกโก้', 'ลาดพร้าว', 'HAS_LEAD'),
        report('r4', 'ข้าวตู', 'ซอยบ้านฉัน'),              // ไม่ตรง 50 เขต → ไม่มีหมุด แต่ยังอยู่ในรายการ
      ],
      next_cursor: null,
    }))
  })

  it('รวมประกาศเป็นหมุดละเขต ใช้สถานะเร่งด่วนสุด และบอกจำนวนที่ไม่มีหมุด', async () => {
    render(<MemoryRouter><MapView /></MemoryRouter>)
    const bangkapi = await screen.findByRole('button', { name: /^เขตบางกะปิ 2 ประกาศ สถานะเร่งด่วนสุด กำลังตามหา/ })
    expect(bangkapi).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /^เขตลาดพร้าว 1 ประกาศ สถานะเร่งด่วนสุด มีเบาะแส/ })).toBeInTheDocument()
    expect(screen.getByText(/1 ประกาศไม่มีหมุด/)).toBeInTheDocument()
  })

  it('กดหมุดแล้วรายการเหลือเฉพาะเขตนั้น และมีการ์ดลิงก์ไปประกาศ', async () => {
    render(<MemoryRouter><MapView /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: /^เขตลาดพร้าว/ }))

    expect(screen.getByRole('heading', { name: /เขตลาดพร้าว/ })).toBeInTheDocument()
    expect(screen.queryByText('ส้มจี๊ด')).not.toBeInTheDocument()
    const tip = screen.getByRole('status')
    expect(within(tip).getByRole('link', { name: 'ดูประกาศ' })).toHaveAttribute('href', '/reports/r3')

    await userEvent.click(screen.getByRole('button', { name: 'ดูทุกเขต' }))
    expect(screen.getByText('ส้มจี๊ด')).toBeInTheDocument()
  })
})
