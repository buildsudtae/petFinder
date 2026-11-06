import { describe, expect, it } from 'vitest'

import { labelWidth, placeLabels } from './mapLabels'

const overlap = (a: { left: number; top: number; width: number; height: number }, b: typeof a) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height

describe('placeLabels', () => {
  it('หมุดใกล้กัน: ชื่อเขตไม่ทับกันและไม่ทับหมุด', () => {
    const pins = [
      { key: 'ปทุมวัน', x: 300, y: 200, text: 'ปทุมวัน', weight: 3 },
      { key: 'ราชเทวี', x: 300, y: 230, text: 'ราชเทวี', weight: 1 },
      { key: 'บางรัก', x: 330, y: 215, text: 'บางรัก', weight: 2 },
    ]
    const placed = placeLabels(pins, { width: 800, height: 500 })
    const boxes = [...placed.values()]
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false)
      for (const p of pins) expect(overlap(boxes[i], { left: p.x - 18, top: p.y - 18, width: 36, height: 36 })).toBe(false)
    }
    expect(placed.has('ปทุมวัน')).toBe(true)   // เขตที่มีประกาศมากสุดได้ที่ก่อน
  })

  it('ไม่วางชื่อล้นขอบกล่องแผนที่', () => {
    const placed = placeLabels([{ key: 'a', x: 10, y: 490, text: 'ทวีวัฒนา', weight: 1 }], { width: 800, height: 500 })
    const b = placed.get('a')!
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.top + b.height).toBeLessThanOrEqual(500)
  })

  it('สระบน/ล่างและวรรณยุกต์ไม่กินความกว้าง', () => {
    expect(labelWidth('ที่')).toBe(labelWidth('ท'))
  })
})
