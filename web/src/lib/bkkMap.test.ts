import { describe, expect, it } from 'vitest'

import { DISTRICT_FEATURES, MAX_ZOOM, districtBounds, districtCenter, districtFeature } from './bkkMap'
import { DISTRICT_CENTROIDS } from './districts'

describe('bkkMap', () => {
  it('มีขอบเขตครบ 50 เขต และชื่อตรงกับรายการเขตที่ผู้ใช้เลือกได้', () => {
    expect(DISTRICT_FEATURES).toHaveLength(50)
    for (const name of Object.keys(DISTRICT_CENTROIDS)) expect(districtFeature(name), name).not.toBeNull()
  })

  it('รับชื่อที่มีคำว่า "เขต" นำหน้า และไม่รู้จักชื่อนอก 50 เขต', () => {
    expect(districtFeature('เขตบางกะปิ ')?.properties.name).toBe('บางกะปิ')
    expect(districtFeature('ซอยบ้านฉัน')).toBeNull()
  })

  it('ตัวเลขกลางเขตอยู่ในกรอบของเขตนั้นเสมอ', () => {
    for (const f of DISTRICT_FEATURES) expect(districtBounds(f).contains(districtCenter(f)), f.properties.name).toBe(true)
  })

  it('ซูมได้สุดระดับถนน ไม่ถึงระดับบ้าน (D9)', () => {
    expect(MAX_ZOOM).toBeLessThanOrEqual(14)
  })
})
