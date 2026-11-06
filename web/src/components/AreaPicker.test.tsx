import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AreaPicker } from './AreaPicker'

describe('AreaPicker', () => {
  it('ยังไม่เลือกเขตที่ตรง 50 เขต = ยังปักไม่ได้ และบอกว่าไม่บังคับ', () => {
    render(<AreaPicker district="" value={null} onChange={() => undefined} />)
    expect(screen.getByText(/เลือกเขตจาก 50 เขตก่อน/)).toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('ปักแล้วบอกว่าคนอื่นเห็นเป็นวงกลม และล้างบริเวณได้', async () => {
    const onChange = vi.fn()
    render(<AreaPicker district="บางกะปิ" value={[13.766, 100.645]} onChange={onChange} />)
    expect(screen.getByRole('region', { name: /ปักบริเวณที่หายในเขตบางกะปิ/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('วงกลมรัศมีราว 150 ม.')
    await userEvent.click(screen.getByRole('button', { name: 'ล้างบริเวณ' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
