import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report, type Status } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { PetPhoto } from '../components/PetPhoto'
import { StatusPill } from '../components/StatusPill'
import { DISTRICT_CENTROIDS, centroidOf } from '../lib/districts'
import { SPECIES_TH, STATUS_TH } from '../lib/labels'
import { elapsedParts } from '../lib/time'

// กรอบของ กทม. ที่ใช้ฉายพิกัดจุดกลางเขตลงพื้นที่สี่เหลี่ยม (ไม่ใช่แผนที่จริง ไม่มี tile จากภายนอก)
const LAT_TOP = 13.93, LAT_BOTTOM = 13.58, LNG_LEFT = 100.32, LNG_RIGHT = 100.88
const W = 1000, H = 640
const toXY = ([lat, lng]: [number, number]) => [
  ((lng - LNG_LEFT) / (LNG_RIGHT - LNG_LEFT)) * W,
  ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
] as const
const PIN_BG: Record<Status, string> = { SEARCHING: 'var(--sticker-search)', HAS_LEAD: 'var(--sticker-lead)', RESOLVED: 'var(--sticker-found)' }
const URGENCY: Status[] = ['SEARCHING', 'HAS_LEAD', 'RESOLVED']   // หมุดเขตใช้สถานะที่เร่งด่วนที่สุดในเขตนั้น
const SPECIES = [['', 'ทั้งหมด'], ...Object.entries(SPECIES_TH)] as const

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

  const load = useCallback(() => {
    setError(null)
    setItems(null)
    api.reportPage({ species, include_resolved: withFound, limit: 100 })
      .then((p) => setItems(p.items), (e) => { setError(e); setItems([]) })
  }, [species, withFound])
  useEffect(load, [load])

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
      return { district, x, y, reports, status }
    })
    return { pins: list, unplaced: out }
  }, [items])

  const selected = pins.find((p) => p.district === sel) ?? null
  const shown = selected ? selected.reports : items ?? []

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
            {shown.map((r) => {
              const parts = r.status === 'RESOLVED' ? null : elapsedParts(r.last_seen_at)
              return (
                <li key={r.id}>
                  <Link to={`/reports/${r.id}`} className={`map-row${selected ? ' sel' : ''}`}>
                    <PetPhoto url={r.photo_url} species={r.species} alt={`รูป${r.pet_name}`} className="pet-thumb" />
                    <div style={{ minWidth: 0 }}>
                      <StatusPill status={r.status} />
                      <p><strong>{r.pet_name}</strong> <span className="meta">· {SPECIES_TH[r.species]}</span></p>
                      <p className="meta">{r.district}{parts ? ` · หายไป ${parts.map(([n, u]) => `${n} ${u}`).join(' ')}` : ''}</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
          {unplaced.length > 0 && !selected && (
            <p className="meta" style={{ padding: 12 }}>{unplaced.length} ประกาศไม่มีหมุด เพราะชื่อเขตไม่ตรงกับ 50 เขต กทม. (ยังอยู่ในรายการด้านบน)</p>
          )}
        </div>

        <div className="map-pane">
         <div className="map-canvas">
          {/* สัดส่วนกล่องเท่า viewBox — จุด (svg) กับหมุด (ปุ่มที่วางด้วย %) จึงตรงกันทุกขนาดจอ */}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {Object.entries(DISTRICT_CENTROIDS).map(([name, c]) => {
              const [x, y] = toXY(c)
              return <circle key={name} cx={x} cy={y} r={5} fill="var(--map-dot)" />
            })}
          </svg>
          {pins.map((p) => (
            <span key={`l-${p.district}`} className="map-label" aria-hidden="true"
                  style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>{p.district}</span>
          ))}
          {pins.map((p) => (
            <button key={p.district} type="button" className="map-pin"
                    aria-label={`เขต${p.district} ${p.reports.length} ประกาศ สถานะเร่งด่วนสุด ${STATUS_TH[p.status]}`}
                    aria-pressed={sel === p.district}
                    onClick={() => setSel(sel === p.district ? null : p.district)}
                    style={{
                      position: 'absolute', left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, translate: '-50% -50%',
                      width: 36, height: 36, borderRadius: 999, border: '2px solid #FFFFFF', background: PIN_BG[p.status],
                      color: p.status === 'RESOLVED' ? '#FFFFFF' : '#111111', fontFamily: 'var(--mono)', fontWeight: 600,
                      boxShadow: sel === p.district ? '0 0 0 4px var(--ink)' : '0 2px 8px rgba(17,17,17,0.3)',
                    }}>
              {p.reports.length}
            </button>
          ))}
         </div>
          <div className="map-legend">
            <span style={{ color: 'var(--ink)' }}>สีหมุด</span> ส้ม = มีประกาศกำลังตามหา · เหลือง = มีเบาะแส · เขียว = พบแล้วทั้งหมด · จุดเทา = จุดกลางเขตที่ยังไม่มีประกาศ
          </div>
        </div>
      </div>
    </section>
  )
}
