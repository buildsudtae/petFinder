import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report, type Status } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { PetPhoto } from '../components/PetPhoto'
import { StatusPill } from '../components/StatusPill'
import { DISTRICT_CENTROIDS, centroidOf } from '../lib/districts'
import { SPECIES_TH, STATUS_TH } from '../lib/labels'
import { placeLabels } from '../lib/mapLabels'
import { elapsedParts } from '../lib/time'

// กรอบของ กทม. ที่ใช้ฉายพิกัดจุดกลางเขตลงพื้นที่สี่เหลี่ยม (ไม่ใช่แผนที่จริง ไม่มี tile จากภายนอก)
const LAT_TOP = 13.93, LAT_BOTTOM = 13.58, LNG_LEFT = 100.32, LNG_RIGHT = 100.88
const W = 1000, H = 640
type LatLng = [number, number]
const toXY = ([lat, lng]: LatLng) => [
  ((lng - LNG_LEFT) / (LNG_RIGHT - LNG_LEFT)) * W,
  ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
] as const
const line = (pts: LatLng[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${toXY(p).map((n) => n.toFixed(1)).join(' ')}`).join('')

// ภาพพื้นหลังวาดคร่าวๆ ให้พอจำทิศทางได้ — แม่น้ำเจ้าพระยา ถนนสายหลัก สวนใหญ่ (ตำแหน่งโดยประมาณ)
const RIVER = line([
  [13.94, 100.497], [13.86, 100.503], [13.81, 100.512], [13.78, 100.500], [13.755, 100.490], [13.735, 100.502],
  [13.718, 100.512], [13.703, 100.515], [13.693, 100.532], [13.700, 100.552], [13.690, 100.570], [13.668, 100.565],
  [13.660, 100.545], [13.635, 100.540], [13.600, 100.553], [13.57, 100.565],
])
const ROADS: { d: string; w: number }[] = [
  { d: line([[13.94, 100.585], [13.83, 100.560], [13.77, 100.553], [13.745, 100.540]]), w: 10 },                    // วิภาวดีฯ
  { d: line([[13.745, 100.540], [13.735, 100.585], [13.705, 100.605], [13.668, 100.625], [13.62, 100.66]]), w: 10 }, // สุขุมวิท
  { d: line([[13.80, 100.555], [13.81, 100.60], [13.835, 100.66], [13.86, 100.74], [13.87, 100.88]]), w: 8 },       // ลาดพร้าว–รามอินทรา
  { d: line([[13.75, 100.555], [13.757, 100.62], [13.765, 100.70], [13.78, 100.88]]), w: 8 },                       // รามคำแหง
  { d: line([[13.668, 100.605], [13.66, 100.70], [13.65, 100.88]]), w: 8 },                                         // บางนา–ตราด
  { d: line([[13.723, 100.49], [13.715, 100.42], [13.71, 100.32]]), w: 8 },                                         // เพชรเกษม
  { d: line([[13.69, 100.49], [13.66, 100.43], [13.63, 100.32]]), w: 6 },                                           // พระราม 2
  { d: line([[13.80, 100.555], [13.78, 100.60], [13.73, 100.61], [13.69, 100.57]]), w: 6 },                         // รัชดาฯ ฝั่งตะวันออก
  { d: line([[13.83, 100.50], [13.77, 100.45], [13.70, 100.45], [13.68, 100.48]]), w: 6 },                          // ราชพฤกษ์
]
const PARKS: { c: LatLng; rx: number; ry: number }[] = [
  { c: [13.803, 100.553], rx: 26, ry: 18 },   // สวนจตุจักร
  { c: [13.688, 100.662], rx: 30, ry: 20 },   // สวนหลวง ร.9
  { c: [13.675, 100.560], rx: 30, ry: 18 },   // บางกระเจ้า
]

const PIN_CLS: Record<Status, string> = { SEARCHING: 'p-search', HAS_LEAD: 'p-lead', RESOLVED: 'p-found' }
const URGENCY: Status[] = ['SEARCHING', 'HAS_LEAD', 'RESOLVED']   // หมุดเขตใช้สถานะที่เร่งด่วนที่สุดในเขตนั้น
const SPECIES = [['', 'ทั้งหมด'], ...Object.entries(SPECIES_TH)] as const
const elapsedText = (r: Report) => r.status === 'RESOLVED' ? 'พบแล้ว' : `หายไป ${elapsedParts(r.last_seen_at).map(([n, u]) => `${n} ${u}`).join(' ')}`

interface Pin { district: string; x: number; y: number; reports: Report[]; status: Status }

/**
 * แผนที่ระดับเขต (D9): หมุดอยู่ที่จุดกลางของเขต ไม่ใช่ตำแหน่งที่สัตว์หาย —
 * ระบบไม่เก็บพิกัด ไม่ขอตำแหน่งของผู้ใช้ และไม่ค้นหาตามรัศมี
 */
export function MapView() {
  const [items, setItems] = useState<Report[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [species, setSpecies] = useState('')
  const [withFound, setWithFound] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: W, height: H })

  const load = useCallback(() => {
    setError(null)
    setItems(null)
    api.reportPage({ species, include_resolved: withFound, limit: 100 })
      .then((p) => setItems(p.items), (e) => { setError(e); setItems([]) })
  }, [species, withFound])
  useEffect(load, [load])

  // ชื่อเขตวางเป็นพิกเซล — ต้องรู้ขนาดกล่องจริงเพื่อหลบกันได้ทั้งจอใหญ่และมือถือ
  useEffect(() => {
    const el = canvas.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setBox({ width: e.contentRect.width, height: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!sel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  const { pins, unplaced } = useMemo(() => {
    const byDistrict = new Map<string, Report[]>()
    const out: Report[] = []
    for (const r of items ?? []) {
      const c = centroidOf(r.district)
      if (!c) { out.push(r); continue }
      const key = r.district.trim().replace(/^เขต\s*/, '')
      byDistrict.set(key, [...(byDistrict.get(key) ?? []), r])
    }
    const list: Pin[] = [...byDistrict].map(([district, reports]) => {
      const [x, y] = toXY(DISTRICT_CENTROIDS[district])
      const status = URGENCY.find((s) => reports.some((r) => r.status === s)) ?? 'SEARCHING'
      const sorted = [...reports].sort((a, b) => URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status) || b.created_at.localeCompare(a.created_at))
      return { district, x, y, reports: sorted, status }
    })
    return { pins: list, unplaced: out }
  }, [items])

  const labels = useMemo(() => {
    const sx = box.width / W, sy = box.height / H
    return placeLabels(pins.map((p) => ({ key: p.district, x: p.x * sx, y: p.y * sy, text: p.district, weight: p.reports.length })), box)
  }, [pins, box])

  const selected = pins.find((p) => p.district === sel) ?? null
  const shown = selected ? selected.reports : items ?? []
  const top = selected?.reports[0]
  // การ์ดชี้หมุด: อยู่เหนือหมุดถ้ามีที่พอ (การ์ดสูงราว 130px) ไม่งั้นลงใต้หมุด และไม่ล้นซ้ายขวา
  const tipLeft = selected ? Math.min(Math.max((selected.x / W) * box.width, 138), box.width - 138) : 0

  return (
    <section className="stack">
      <div className="list-head" style={{ paddingBottom: 0 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1>แผนที่ประกาศระดับเขต</h1>
          <p className="meta">หมุดอยู่ที่จุดกลางของเขต ไม่ใช่ตำแหน่งจริงที่สัตว์หาย · ตัวเลขบนหมุด = จำนวนประกาศในเขตนั้น</p>
        </div>
        <Link to="/" className="btn btn-line">ดูแบบรายการ</Link>
      </div>

      <div className="filters" role="group" aria-label="ตัวกรองประกาศ" style={{ paddingBottom: 0 }}>
        <div className="seg" role="group" aria-label="ชนิดสัตว์">
          {SPECIES.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={species === v} onClick={() => { setSpecies(v); setSel(null) }}>{label}</button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={withFound} onChange={(e) => { setWithFound(e.target.checked); setSel(null) }} />
          รวมที่พบแล้ว
        </label>
      </div>
      <ErrorBanner error={error} onRetry={load} />

      <div className="map-split">
        <div className="map-list" aria-live="polite">
          <div className="row" style={{ justifyContent: 'space-between', padding: '12px 12px 4px' }}>
            <h2 style={{ fontSize: '1rem' }}>{selected ? `เขต${selected.district}` : 'ทุกเขต'} <span className="meta mono">{items ? shown.length : ''}</span></h2>
            {selected && <button type="button" className="btn btn-line" onClick={() => setSel(null)}>ดูทุกเขต</button>}
          </div>
          {items === null && <p className="loading" style={{ padding: 12 }}>กำลังโหลด…</p>}
          {items?.length === 0 && !error && <p className="meta" style={{ padding: 12 }}>ยังไม่มีประกาศที่ตรงกับตัวกรอง</p>}
          <ul>
            {shown.map((r) => (
              <li key={r.id}>
                <Link to={`/reports/${r.id}`} className={`map-row${selected ? ' sel' : ''}`}>
                  <PetPhoto url={r.photo_url} species={r.species} alt={`รูป${r.pet_name}`} className="pet-thumb" />
                  <div style={{ minWidth: 0 }}>
                    <StatusPill status={r.status} />
                    <p><strong>{r.pet_name}</strong> <span className="meta">· {SPECIES_TH[r.species]}</span></p>
                    <p className="meta">{r.district}{r.status === 'RESOLVED' ? '' : ` · ${elapsedText(r)}`}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {unplaced.length > 0 && !selected && (
            <p className="meta" style={{ padding: 12 }}>{unplaced.length} ประกาศไม่มีหมุด เพราะชื่อเขตไม่ตรงกับ 50 เขต กทม. (ยังอยู่ในรายการด้านบน)</p>
          )}
        </div>

        <div className="map-pane">
          <div className="map-canvas" ref={canvas}>
            {/* สัดส่วนกล่องเท่า viewBox — ภาพพื้นหลัง (svg) กับหมุด (ปุ่มที่วางด้วย %) จึงตรงกันทุกขนาดจอ */}
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <rect width={W} height={H} fill="var(--map-land)" />
              {PARKS.map((p, i) => {
                const [cx, cy] = toXY(p.c)
                return <ellipse key={i} cx={cx} cy={cy} rx={p.rx} ry={p.ry} fill="var(--map-park)" />
              })}
              <g fill="none" stroke="var(--map-road)" strokeLinecap="round" strokeLinejoin="round">
                {ROADS.map((r, i) => <path key={i} d={r.d} strokeWidth={r.w} />)}
              </g>
              <path d={RIVER} fill="none" stroke="var(--map-water)" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
              {Object.entries(DISTRICT_CENTROIDS).map(([name, c]) => {
                const [x, y] = toXY(c)
                return <circle key={name} cx={x} cy={y} r={3.5} fill="var(--map-dot)" />
              })}
            </svg>
            {pins.map((p) => {
              const b = labels.get(p.district)
              return b && (
                <span key={`l-${p.district}`} className="map-label" aria-hidden="true" style={{ left: b.left, top: b.top }}>{p.district}</span>
              )
            })}
            {pins.map((p) => (
              <button key={p.district} type="button" className={`map-pin ${PIN_CLS[p.status]}`}
                      aria-label={`เขต${p.district} ${p.reports.length} ประกาศ สถานะเร่งด่วนสุด ${STATUS_TH[p.status]}`}
                      aria-pressed={sel === p.district}
                      onClick={() => setSel(sel === p.district ? null : p.district)}
                      style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>
                {p.reports.length}
              </button>
            ))}
            {selected && top && (
              <div className={`map-tip ${(selected.y / H) * box.height < 170 ? 'below' : 'above'}`} role="status"
                   style={{ left: tipLeft, top: `${(selected.y / H) * 100}%` }}>
                <PetPhoto url={top.photo_url} species={top.species} alt={`รูป${top.pet_name}`} className="pet-thumb" />
                <div style={{ minWidth: 0 }}>
                  <p><strong>{top.pet_name}</strong> <span className="meta">· {SPECIES_TH[top.species]}</span></p>
                  <p className="caption">เขต{selected.district} · {elapsedText(top)}</p>
                  <Link to={`/reports/${top.id}`}>ดูประกาศ</Link>
                  {selected.reports.length > 1 && <span className="caption"> · อีก {selected.reports.length - 1} ประกาศในรายการ</span>}
                </div>
              </div>
            )}
            <div className="map-legend">
              <span><i className="dot" style={{ background: 'var(--sticker-search)' }} />กำลังตามหา</span>
              <span><i className="dot" style={{ background: 'var(--sticker-lead)' }} />มีเบาะแส</span>
              <span><i className="dot" style={{ background: 'var(--sticker-found)' }} />พบแล้วทั้งหมด</span>
            </div>
          </div>
          <p className="map-note">แม่น้ำ ถนน และสวนวาดไว้คร่าวๆ ให้พอดูทิศทาง ไม่ใช่แผนที่จริง · จุดเล็กสีเทา = จุดกลางเขตที่ยังไม่มีประกาศ</p>
        </div>
      </div>
    </section>
  )
}
