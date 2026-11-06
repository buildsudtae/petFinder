import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DistrictMiniMap } from './DistrictMiniMap'

describe('DistrictMiniMap', () => {
  it('แสดงแผนที่ของเขตที่หาย พร้อมบอกว่าเป็นระดับเขต ไม่ใช่ตำแหน่งบ้าน', () => {
    render(<DistrictMiniMap district="เขตลาดพร้าว" sightingDistricts={['บางกะปิ', 'บางกะปิ']} />)
    expect(screen.getByRole('region', { name: 'แผนที่เขตลาดพร้าว' })).toBeInTheDocument()
    expect(screen.getByText('แสดงระดับเขต ไม่ใช่ตำแหน่งบ้าน')).toBeInTheDocument()
    expect(screen.getByText(/จำนวนเบาะแสในเขตนั้น/)).toBeInTheDocument()
  })

  it('ถ้าเจ้าของปักบริเวณไว้ บอกว่าเป็นบริเวณโดยประมาณ ไม่ใช่ตำแหน่งบ้าน', () => {
    render(<DistrictMiniMap district="ลาดพร้าว" sightingDistricts={[]} area={[13.805, 100.608]} />)
    expect(screen.getByText('บริเวณโดยประมาณ ไม่ใช่ตำแหน่งบ้าน')).toBeInTheDocument()
    expect(screen.getByText(/รัศมีราว 150 ม./)).toBeInTheDocument()
  })

  it('ไม่แสดงอะไรถ้าชื่อเขตไม่ตรง 50 เขต (ไม่เดาตำแหน่ง)', () => {
    const { container } = render(<DistrictMiniMap district="ซอยบ้านฉัน" sightingDistricts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
