import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { ReportCard } from '../components/ReportCard'
import { DISTRICTS, SPECIES_TH, STATUS_TH } from '../lib/labels'

const PAGE = 20

export function ReportList() {
  const [params, setParams] = useSearchParams()
  const species = params.get('species') ?? ''
  const district = params.get('district') ?? ''
  const status = params.get('status') ?? ''
  const [districtDraft, setDistrictDraft] = useState(district)
  const [limit, setLimit] = useState(PAGE)
  const [items, setItems] = useState<Report[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => setDistrictDraft(district), [district])

  const load = useCallback(() => {
    setError(null)
    setItems(null)
    // ไม่ส่ง status = เฉพาะประกาศที่ยังเปิดอยู่ (กำลังตามหา + มีเบาะแส)
    api.reports({ species, district, status, limit }).then(setItems, (e) => { setError(e); setItems([]) })
  }, [species, district, status, limit])

  useEffect(load, [load])

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setLimit(PAGE)
    setParams(next)
  }

  const filtered = !!(species || district || status)

  return (
    <section className="stack">
      <div className="page-head">
        <h1>ประกาศสัตว์หาย</h1>
        <Link to="/reports/new" className="btn btn-primary">แจ้งสัตว์หาย</Link>
      </div>

      <form className="filters card" role="search" aria-label="กรองประกาศ"
            onSubmit={(e) => { e.preventDefault(); setFilter('district', districtDraft.trim()) }}>
        <div className="field">
          <label htmlFor="f-species">ชนิด</label>
          <select id="f-species" value={species} onChange={(e) => setFilter('species', e.target.value)}>
            <option value="">ทุกชนิด</option>
            {Object.entries(SPECIES_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-district">เขต</label>
          <input id="f-district" list="f-districts" value={districtDraft} placeholder="ทุกเขต"
                 onChange={(e) => setDistrictDraft(e.target.value)}
                 onBlur={() => districtDraft.trim() !== district && setFilter('district', districtDraft.trim())} />
          <datalist id="f-districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor="f-status">สถานะ</label>
          <select id="f-status" value={status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">ที่ยังเปิดอยู่</option>
            {Object.entries(STATUS_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </form>

      <ErrorBanner error={error} onRetry={load} />

      {items === null && (
        <ul className="report-list" aria-busy="true" aria-label="กำลังโหลด">
          {[0, 1, 2].map((i) => <li key={i} className="card skeleton" aria-hidden="true" />)}
        </ul>
      )}

      {items && items.length === 0 && !error && (
        <div className="card empty">
          <p>{district ? 'ยังไม่มีประกาศในเขตนี้ — ลองเลือกเขตอื่น หรือดูทุกเขต' : 'ยังไม่มีประกาศที่ตรงกับตัวกรอง'}</p>
          {filtered && (
            <button type="button" className="btn btn-secondary" onClick={() => { setLimit(PAGE); setParams({}) }}>
              ล้างตัวกรอง
            </button>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <p className="meta" role="status">พบ {items.length} ประกาศ</p>
          <ul className="report-list">{items.map((r) => <ReportCard key={r.id} report={r} />)}</ul>
          {items.length >= limit && limit < 100 && (
            <button type="button" className="btn btn-secondary" onClick={() => setLimit(limit + PAGE)}>ดูเพิ่ม</button>
          )}
        </>
      )}
    </section>
  )
}
