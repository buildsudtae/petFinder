import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportList } from './ReportList'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const report = (id: string, name: string) => ({
  id, status: 'SEARCHING', pet_name: name, species: 'cat', color: null, marks: null, photo_url: null,
  last_seen_at: '2026-10-01T00:00:00Z', district: 'บางกะปิ', area_note: null, description: null,
  sighting_count: 0, is_owner: false, created_at: '2026-10-01T00:00:00Z',
})

describe('ReportList', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('กดดูเพิ่มแล้วขอหน้าถัดไปด้วย cursor และต่อท้ายรายการเดิม', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      return url.includes('cursor=c1')
        ? json({ items: [report('r2', 'มอลลี่')], next_cursor: null })
        : json({ items: [report('r1', 'ส้มจี๊ด')], next_cursor: 'c1' })
    })
    render(<MemoryRouter><ReportList /></MemoryRouter>)
    await screen.findByText('ส้มจี๊ด')
    await userEvent.click(screen.getByRole('button', { name: 'ดูเพิ่ม' }))

    expect(await screen.findByText('มอลลี่')).toBeInTheDocument()
    expect(screen.getByText('ส้มจี๊ด')).toBeInTheDocument()
    expect(screen.getByText('แสดงครบทุกประกาศแล้ว')).toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u).includes('cursor=c1'))).toBe(true)
  })
})
