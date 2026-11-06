import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report, type Status } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { PetPhoto } from '../components/PetPhoto'
import { StatusPill } from '../components/StatusPill'
import { DISTRICT_FEATURES, createBaseMap, districtBounds, districtCenter, districtFeature, districtKey, reducedMotion } from '../lib/bkkMap'
import { SPECIES_TH, STATUS_TH } from '../lib/labels'
import { placeLabels } from '../lib/mapLabels'
import { elapsedParts } from '../lib/time'

const PIN_CLS: Record<Status, string> = { SEARCHING: 'p-search', HAS_LEAD: 'p-lead', RESOLVED: 'p-found' }
const URGENCY: Status[] = ['SEARCHING', 'HAS_LEAD', 'RESOLVED']   // เขตใช้สถานะที่เร่งด่วนที่สุดในเขตนั้น
const SPECIES = [['', 'ทั้งหมด'], ...Object.entries(SPECIES_TH)] as const
const elapsedText = (r: Report) => r.status === 'RESOLVED' ? 'พบแล้ว' : `หายไป ${elapsedParts(r.last_seen_at).map(([n, u]) => `${n} ${u}`).join(' ')}`
// เจาะเข้าไปในเขต: ซูมให้เห็นถนนในเขต แต่ไม่เกิน 13 เพื่อยังเห็นขอบเขตทั้งเขต (ผู้ใช้ซูมต่อเองได้ถึง 14)
const DRILL_ZOOM = 13

interface Group { district: string; center: L.LatLng; reports: Report[]; status: Status }

/**
 * แผนที่ระดับเขต (D9): ระบายสีทั้งเขตตามสถานะ ตัวเลขกลางเขต = จำนวนประกาศ ไม่มีหมุดตำแหน่งจริง —
 * ระบบไม่เก็บพิกัด ไม่ขอตำแหน่งของผู้ใช้ และไม่ค้นหาตามรัศมี
 */
export function MapView() {
  const [items, setItems] = useState<Report[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [species, setSpecies] = useState('')
  const [withFound, setWithFound] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [tilesDown, setTilesDown] = useState(false)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const shapes = useRef(new Map<string, L.Path>())
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [, setTick] = useState(0)   // ตำแหน่งตัวเลข/ชื่อเขตคำนวณใหม่ทุกครั้งที่เลื่อนหรือซูม
  const [zooming, setZooming] = useState(false)
  const selRef = useRef(sel)
  selRef.current = sel

  const load = useCallback(() => {
    setError(null)
    setItems(null)
    api.reportPage({ species, include_resolved: withFound, limit: 100 })
      .then((p) => setItems(p.items), (e) => { setError(e); setItems([]) })
  }, [species, withFound])
  useEffect(load, [load])

  const { groups, unplaced } = useMemo(() => {
    const byDistrict = new Map<string, Report[]>()
    const out: Report[] = []
    for (const r of items ?? []) {
      if (!districtFeature(r.district)) { out.push(r); continue }
      const key = districtKey(r.district)
      byDistrict.set(key, [...(byDistrict.get(key) ?? []), r])
    }
    const list: Group[] = [...byDistrict].map(([district, reports]) => {
      const status = URGENCY.find((s) => reports.some((r) => r.status === s)) ?? 'SEARCHING'
      const sorted = [...reports].sort((a, b) => URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status) || b.created_at.localeCompare(a.created_at))
      return { district, center: districtCenter(districtFeature(district)!), reports: sorted, status }
    })
    return { groups: list, unplaced: out }
  }, [items])
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // สร้างแผนที่ครั้งเดียว: ภาพถนน + ขอบ 50 เขต
  useEffect(() => {
    if (!el.current) return
    const m = createBaseMap(el.current, { onTileError: () => setTilesDown(true) })
    const all = L.geoJSON(DISTRICT_FEATURES as never, {
      style: { className: 'dz', weight: 1 },
      onEachFeature: (f, layer) => {
        const name = (f.properties as { name: string }).name
        shapes.current.set(name, layer as L.Path)
        layer.on('click', () => {
          if (groupsRef.current.some((g) => g.district === name)) setSel(selRef.current === name ? null : name)
        })
      },
    }).addTo(m)
    m.fitBounds(all.getBounds(), { padding: [8, 8] })
    const bump = () => setTick((t) => t + 1)
    m.on('move zoomend viewreset resize', bump)
    m.on('zoomstart', () => setZooming(true))
    m.on('zoomend', () => setZooming(false))
    map.current = m
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([e]) => {
      setBox({ width: e.contentRect.width, height: e.contentRect.height })
      m.invalidateSize()
    })
    ro?.observe(el.current)
    const shapeMap = shapes.current
    return () => { ro?.disconnect(); m.remove(); map.current = null; shapeMap.clear() }
  }, [])

  // สีของแต่ละเขต: ตามสถานะที่เร่งด่วนที่สุด · เขตที่ไม่มีประกาศเหลือแค่เส้นขอบ
  useEffect(() => {
    const status = new Map(groups.map((g) => [g.district, g.status]))
    for (const [name, layer] of shapes.current) {
      const s = status.get(name)
      layer.getElement()?.setAttribute('class', `leaflet-interactive dz ${s ? PIN_CLS[s] : 'empty'}${sel === name ? ' sel' : ''}`)
    }
  }, [groups, sel])

  // เจาะลึกลงในเขตที่เลือก แล้วถอยกลับมาเห็นทั้ง กทม. เมื่อยกเลิก
  useEffect(() => {
    const m = map.current
    if (!m) return
    const f = sel ? districtFeature(sel) : null
    const target = f ? districtBounds(f) : L.geoJSON(DISTRICT_FEATURES as never).getBounds()
    m.flyToBounds(target, { padding: [24, 24], maxZoom: f ? DRILL_ZOOM : undefined, duration: 0.6, animate: !reducedMotion() })
  }, [sel])

  useEffect(() => {
    if (!sel) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  const m = map.current
  const pins = groups.map((g) => {
    const p = m ? m.latLngToContainerPoint(g.center) : L.point(0, 0)
    return { ...g, x: p.x, y: p.y }
  }).filter((p) => !box.width || (p.x > -40 && p.y > -40 && p.x < box.width + 40 && p.y < box.height + 40) || p.district === sel)
  const labels = placeLabels(pins.map((p) => ({ key: p.district, x: p.x, y: p.y, text: p.district, weight: p.reports.length })), box)

  const selected = pins.find((p) => p.district === sel) ?? null
  const selGroup = groups.find((g) => g.district === sel) ?? null
  const shown = selGroup ? selGroup.reports : items ?? []
  const top = selected?.reports[0]
  // การ์ดชี้เขต: อยู่เหนือตัวเลขถ้ามีที่พอ (การ์ดสูงราว 130px) ไม่งั้นลงใต้ และไม่ล้นซ้ายขวา
  const tipLeft = selected ? Math.min(Math.max(selected.x, 138), box.width - 138) : 0

  return (
    <section className="stack">
      <div className="list-head" style={{ paddingBottom: 0 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1>แผนที่ประกาศระดับเขต</h1>
          <p className="meta">สีบอกสถานะของเขต ตัวเลข = จำนวนประกาศในเขตนั้น · กดเขตเพื่อซูมเข้าไปดูถนนในเขต ไม่ใช่ตำแหน่งจริงที่สัตว์หาย</p>
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
            <h2 style={{ fontSize: '1rem' }}>{selGroup ? `เขต${selGroup.district}` : 'ทุกเขต'} <span className="meta mono">{items ? shown.length : ''}</span></h2>
            {selGroup && <button type="button" className="btn btn-line" onClick={() => setSel(null)}>ดูทุกเขต</button>}
          </div>
          {items === null && <p className="loading" style={{ padding: 12 }}>กำลังโหลด…</p>}
          {items?.length === 0 && !error && <p className="meta" style={{ padding: 12 }}>ยังไม่มีประกาศที่ตรงกับตัวกรอง</p>}
          <ul>
            {shown.map((r) => (
              <li key={r.id}>
                <Link to={`/reports/${r.id}`} className={`map-row${selGroup ? ' sel' : ''}`}>
                  <PetPhoto url={r.photo_url} species={r.species} alt={`รูป${r.pet_name}`} className="pet-thumb" />
                  <div style={{ minWidth: 0 }}>
                    <StatusPill status={r.status} />
                    <p><strong>{r.pet_name}</strong> <span className="meta">· {SPECIES_TH[r.species]}</span></p>
                    <p className="meta">{r.district}{r.area_note ? ` · ${r.area_note}` : ''}{r.status === 'RESOLVED' ? '' : ` · ${elapsedText(r)}`}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {unplaced.length > 0 && !selGroup && (
            <p className="meta" style={{ padding: 12 }}>{unplaced.length} ประกาศไม่อยู่บนแผนที่ เพราะชื่อเขตไม่ตรงกับ 50 เขต กทม. (ยังอยู่ในรายการด้านบน)</p>
          )}
        </div>

        <div className="map-pane">
          <div className="map-canvas">
            <div className="map-leaflet" ref={el} aria-label="แผนที่ 50 เขต กทม." role="region" />
            <div className={`map-overlay${zooming ? ' moving' : ''}`}>
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
                        style={{ left: p.x, top: p.y }}>
                  {p.reports.length}
                </button>
              ))}
              {selected && top && (
                <div className={`map-tip ${selected.y < 170 ? 'below' : 'above'}`} role="status" style={{ left: tipLeft, top: selected.y }}>
                  <PetPhoto url={top.photo_url} species={top.species} alt={`รูป${top.pet_name}`} className="pet-thumb" />
                  <div style={{ minWidth: 0 }}>
                    <p><strong>{top.pet_name}</strong> <span className="meta">· {SPECIES_TH[top.species]}</span></p>
                    <p className="caption">เขต{selected.district}{top.area_note ? ` · ${top.area_note}` : ''} · {elapsedText(top)}</p>
                    <Link to={`/reports/${top.id}`}>ดูประกาศ</Link>
                    {selected.reports.length > 1 && <span className="caption"> · อีก {selected.reports.length - 1} ประกาศในรายการ</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="map-legend">
              <span><i className="dot" style={{ background: 'var(--sticker-search)' }} />กำลังตามหา</span>
              <span><i className="dot" style={{ background: 'var(--sticker-lead)' }} />มีเบาะแส</span>
              <span><i className="dot" style={{ background: 'var(--sticker-found)' }} />พบแล้วทั้งหมด</span>
            </div>
          </div>
          <p className="map-note">
            {tilesDown
              ? 'โหลดภาพถนนไม่ได้ (อาจไม่มีอินเทอร์เน็ต) ยังเห็นขอบเขตและจำนวนประกาศของแต่ละเขตได้ตามปกติ'
              : 'ระบายสีทั้งเขต ไม่ได้ชี้ถนนหรือซอยที่สัตว์หาย · ซูมได้สุดระดับถนน ไม่ถึงระดับบ้าน'}
          </p>
        </div>
      </div>
    </section>
  )
}
