import { describe, expect, it } from 'vitest'

import { DISTRICT_FEATURES, MAX_ZOOM, districtBounds, districtCenter, districtFeature, inDistrict, roundArea } from './bkkMap'
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

  it('บริเวณที่หายปัดเหลือทศนิยม 3 ตำแหน่ง (ราว 100 ม.) เหมือนที่ server เก็บ', () => {
    expect(roundArea(13.804567, 100.607891)).toEqual([13.805, 100.608])
  })

  it('รู้ว่าจุดอยู่ในเขตไหน — ใช้กันปักบริเวณนอกเขตที่ประกาศ', () => {
    const bangkapi = districtFeature('บางกะปิ')!, ladprao = districtFeature('ลาดพร้าว')!
    const c = districtCenter(bangkapi)
    expect(inDistrict(bangkapi, c.lat, c.lng)).toBe(true)
    expect(inDistrict(ladprao, c.lat, c.lng)).toBe(false)
  })

  it('ซูมได้สุดระดับถนน ไม่ถึงระดับบ้าน (D9)', () => {
    expect(MAX_ZOOM).toBeLessThanOrEqual(14)
  })
})
