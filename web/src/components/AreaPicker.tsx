import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

import { AREA_RADIUS_M, type Area, createBaseMap, districtBounds, districtFeature, inDistrict, roundArea } from '../lib/bkkMap'

interface Props {
  district: string
  value: Area | null
  onChange: (area: Area | null) => void
}

/**
 * ปักบริเวณที่หายโดยประมาณในขั้นที่ 2 (ไม่บังคับ) — แตะบนแผนที่ในเขตที่เลือก
 * ระบบปัดเหลือราว 100 ม. และแสดงเป็นวงกลม ไม่ใช่จุดตรงบ้าน · ไม่ขอตำแหน่งจากเครื่อง (D9)
 */
export function AreaPicker({ district, value, onChange }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const circle = useRef<L.Circle | null>(null)
  const map = useRef<L.Map | null>(null)
  const [outside, setOutside] = useState(false)
  const f = districtFeature(district)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!el.current || !f) return
    const m = createBaseMap(el.current, { wheel: false })
    L.geoJSON(f as never, { interactive: false, style: { className: 'dz home' } }).addTo(m)
    m.fitBounds(districtBounds(f), { padding: [12, 12] })
    m.on('click', (e: L.LeafletMouseEvent) => {
      const ok = inDistrict(f, e.latlng.lat, e.latlng.lng)
      setOutside(!ok)
      if (ok) onChangeRef.current(roundArea(e.latlng.lat, e.latlng.lng))
    })
    map.current = m
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => m.invalidateSize())
    ro?.observe(el.current)
    return () => { ro?.disconnect(); m.remove(); map.current = null; circle.current = null }
  }, [f])

  // วงกลมตามค่าที่เลือก (ค่าที่ปัดแล้ว = สิ่งที่คนอื่นจะเห็นจริง)
  useEffect(() => {
    const m = map.current
    if (!m) return
    circle.current?.remove()
    circle.current = value ? L.circle(value, { radius: AREA_RADIUS_M, interactive: false, className: 'area-circle' }).addTo(m) : null
  }, [value, f])

  if (!f) return <p className="meta">เลือกเขตจาก 50 เขตก่อน แล้วจะปักบริเวณที่หายบนแผนที่ได้ (ไม่บังคับ)</p>
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="mini-map picker">
        <div className="map-leaflet" ref={el} role="region" aria-label={`แผนที่สำหรับปักบริเวณที่หายในเขต${f.properties.name}`} />
        <span className="mini-cap">{value ? 'แตะที่อื่นเพื่อย้าย' : 'แตะบนแผนที่ในเขตที่มีเส้นประ'}</span>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <p className="meta" role="status">
          {outside ? `จุดที่แตะอยู่นอกเขต${f.properties.name} ลองแตะในเส้นประ`
            : value ? 'ปักบริเวณไว้แล้ว คนอื่นจะเห็นเป็นวงกลมรัศมีราว 150 ม.' : 'ยังไม่ได้ปัก (ไม่บังคับ)'}
        </p>
        {value && <button type="button" className="btn btn-line" onClick={() => { onChange(null); setOutside(false) }}>ล้างบริเวณ</button>}
      </div>
    </div>
  )
}
