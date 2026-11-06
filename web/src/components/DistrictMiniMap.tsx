import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'

import { createBaseMap, districtBounds, districtCenter, districtFeature, districtKey } from '../lib/bkkMap'

interface Props {
  district: string
  /** เขตที่มีคนส่งเบาะแสเข้ามา (ซ้ำได้ — นับเป็นจำนวนต่อเขต) */
  sightingDistricts: string[]
}

/**
 * แผนที่เล็กในหน้าประกาศ (D9): ซูมเข้าไปในเขตที่หายให้เห็นถนนในเขตนั้น
 * ระบายทั้งเขต ไม่มีหมุดตำแหน่งจริง · เขตที่มีเบาะแสแสดงเป็นตัวเลขกลางเขต
 */
export function DistrictMiniMap({ district, sightingDistricts }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const [tilesDown, setTilesDown] = useState(false)
  const [pins, setPins] = useState<{ key: string; x: number; y: number; n: number; home: boolean }[]>([])
  const home = districtFeature(district)
  const counts = new Map<string, number>()
  for (const d of sightingDistricts) if (districtFeature(d)) counts.set(districtKey(d), (counts.get(districtKey(d)) ?? 0) + 1)
  const countKey = [...counts].map(([k, n]) => `${k}:${n}`).join('|')

  useEffect(() => {
    if (!el.current || !home) return
    // หน้าประกาศยาว — ล้อเมาส์ใช้เลื่อนหน้า ไม่ใช่ซูมแผนที่ (มีปุ่ม +/− ให้)
    const m = createBaseMap(el.current, { wheel: false, onTileError: () => setTilesDown(true) })
    const homeKey = home.properties.name
    const keys = [homeKey, ...countKey.split('|').filter(Boolean).map((s) => s.split(':')[0])]
    const nByKey = new Map(countKey.split('|').filter(Boolean).map((s) => [s.split(':')[0], Number(s.split(':')[1])]))
    let bounds = districtBounds(home)
    for (const k of new Set(keys)) {
      const f = districtFeature(k)!
      L.geoJSON(f as never, { interactive: false, style: { className: `dz ${k === homeKey ? 'home' : 'p-lead'}` } }).addTo(m)
      bounds = bounds.extend(districtBounds(f))
    }
    m.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 })
    const place = () => setPins([...new Set(keys)].map((k) => {
      const p = m.latLngToContainerPoint(districtCenter(districtFeature(k)!))
      return { key: k, x: p.x, y: p.y, n: nByKey.get(k) ?? 0, home: k === homeKey }
    }))
    place()
    m.on('move zoomend viewreset resize', place)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => m.invalidateSize())
    ro?.observe(el.current)
    return () => { ro?.disconnect(); m.remove() }
  }, [home, countKey])

  if (!home) return null
  const total = sightingDistricts.length
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="mini-map">
        <div className="map-leaflet" ref={el} role="region" aria-label={`แผนที่เขต${home.properties.name}`} />
        {pins.map((p) => (p.home && p.n === 0 ? null : (
          <span key={p.key} className="mini-pin map-pin p-lead" style={{ left: p.x, top: p.y }} aria-hidden="true">{p.n}</span>
        )))}
        <span className="mini-cap">แสดงระดับเขต ไม่ใช่ตำแหน่งบ้าน</span>
      </div>
      <p className="mini-legend">
        <span><i style={{ border: '2px dashed var(--brand)', background: 'transparent' }} />เขต{home.properties.name} ที่หาย</span>
        {total > 0 && <span><i style={{ background: 'var(--sticker-lead)' }} />ตัวเลข = จำนวนเบาะแสในเขตนั้น</span>}
      </p>
      {tilesDown && <p className="meta">โหลดภาพถนนไม่ได้ (อาจไม่มีอินเทอร์เน็ต) ยังเห็นขอบเขตของเขตได้</p>}
    </div>
  )
}
