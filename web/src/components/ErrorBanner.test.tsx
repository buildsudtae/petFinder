import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../api/client'
import { ErrorBanner } from './ErrorBanner'

describe('ErrorBanner', () => {
  it('แสดงข้อความไทยจาก API ไม่ใช่ code', () => {
    render(<ErrorBanner error={new ApiError('REPORT_CLOSED', 'เจ้าของพบสัตว์แล้ว ประกาศนี้ปิดรับเบาะแส', null)} />)
    expect(screen.getByRole('alert')).toHaveTextContent('เจ้าของพบสัตว์แล้ว')
    expect(screen.getByRole('alert')).not.toHaveTextContent('REPORT_CLOSED')
  })

  it('ไม่แสดงอะไรเมื่อไม่มี error', () => {
    const { container } = render(<ErrorBanner error={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('สื่อสถานะด้วยไอคอนและข้อความ ไม่ใช่สีเพียงอย่างเดียว', () => {   // NFR-04 accessibility
    render(<ErrorBanner error={new ApiError('VALIDATION', 'ข้อมูลไม่ถูกต้อง', 'district')} />)
    expect(screen.getByRole('alert')).toHaveTextContent('ข้อมูลไม่ถูกต้อง')
    expect(screen.getByTestId('error-icon')).toBeInTheDocument()
  })
})
