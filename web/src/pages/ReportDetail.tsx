import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report, type ReportEvent, type Sighting } from '../api/endpoints'
import { useAuth } from '../auth'
import { ElapsedClock } from '../components/ElapsedClock'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { StatusPill } from '../components/StatusPill'
import { SPECIES_TH, STATUS_TH } from '../lib/labels'
import { myReportIds } from '../lib/mine'
import { agoTh, dateTimeTh } from '../lib/time'
import { useFormError } from '../lib/useFormError'

export function ReportDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [events, setEvents] = useState<ReportEvent[]>([])
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const reopenForm = useFormError(['reason'])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [r, s, e] = await Promise.all([api.report(id), api.sightings(id), api.events(id)])
      setReport(r)
      setSightings(s)
      setEvents(e)
    } catch (caught) {
      setLoadError(caught as ApiError)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  if (loadError && !report) {
    return (
      <section className="stack">
        <Link to="/" className="back">← กลับ</Link>
        <ErrorBanner error={loadError} onRetry={load} />
      </section>
    )
  }
  if (!report) return <p className="loading" role="status">กำลังโหลด…</p>

  // API ไม่ส่ง owner_id: รู้ได้เฉพาะประกาศที่สร้างจากเบราว์เซอร์นี้ (เซิร์ฟเวอร์ตรวจสิทธิ์จริงเสมอ)
  const isOwner = !!user && myReportIds(user.id).includes(report.id)
  const resolved = report.status === 'RESOLVED'
  const resolvedAt = resolved ? [...events].reverse().find((e) => e.to_status === 'RESOLVED')?.created_at ?? null : null
  const hasSighted = !!user && sightings.some((s) => s.finder_display_name === user.display_name)
  const timeline = [...sightings].reverse()   // ใหม่สุดอยู่บนสุด

  async function change(to: 'RESOLVED' | 'SEARCHING') {
    setBusy(true)
    setActionError(null)
    reopenForm.setError(null)
    try {
      const updated = await api.changeStatus(report!.id, to, to === 'SEARCHING' ? reason : undefined)
      setReport(updated)
      setEvents(await api.events(report!.id))
      setReopening(false)
      setReason('')
    } catch (caught) {
      const err = caught as ApiError
      if (to === 'SEARCHING') reopenForm.setError(err)
      else setActionError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="stack">
      <Link to="/" className="back">← กลับ</Link>

      <div className="card detail-head stack">
        <div className="tile tile-wide" aria-hidden="true">
          <span>{SPECIES_TH[report.species]}</span>
          {resolved && (
            <span className="stamp stamp-big">พบแล้ว{resolvedAt ? ` · ${dateTimeTh(resolvedAt)}` : ''}</span>
          )}
        </div>
        <div><StatusPill status={report.status} /></div>
        <ElapsedClock since={report.last_seen_at} until={resolvedAt} />
        <p className="meta">เห็นครั้งสุดท้าย {dateTimeTh(report.last_seen_at)}</p>

        <h1>{report.pet_name}</h1>
        <p>{SPECIES_TH[report.species]}{report.color ? ` · ${report.color}` : ''}</p>
        {report.marks && <p>{report.marks}</p>}
        {report.description && <p>{report.description}</p>}
        <p><strong>{report.district}</strong>{report.area_note ? ` — ${report.area_note}` : ''}</p>

        {!isOwner && !resolved && (
          <Link to={`/reports/${report.id}/sighting`} className="btn btn-primary">ส่งเบาะแสที่พบ</Link>
        )}
        {!isOwner && resolved && (
          <button type="button" className="btn btn-primary" disabled>ประกาศนี้ปิดรับเบาะแสแล้ว</button>
        )}
        {user && (isOwner || hasSighted) && (
          <Link to={`/reports/${report.id}/messages`} className="btn btn-secondary">
            {isOwner ? 'คุยกับผู้พบเห็น' : 'คุยกับเจ้าของ'}
          </Link>
        )}
      </div>

      {isOwner && (
        <section className="card stack" aria-label="จัดการประกาศ">
          <h2>จัดการประกาศ</h2>
          <ErrorBanner error={actionError} />
          {!resolved && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => change('RESOLVED')}>
              {busy ? 'กำลังปิดประกาศ…' : 'ปิดประกาศ — พบสัตว์แล้ว'}
            </button>
          )}
          {resolved && !reopening && (
            <button type="button" className="btn btn-danger" onClick={() => setReopening(true)}>เปิดประกาศใหม่</button>
          )}
          {resolved && reopening && (
            <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); void change('SEARCHING') }}>
              <ErrorBanner error={reopenForm.bannerError} />
              <Field id="reason" label="เหตุผลที่เปิดประกาศใหม่" hint="ต้องกรอก เช่น ที่พบไม่ใช่ตัวเดิม"
                     error={reopenForm.fieldMessage('reason')}>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
              </Field>
              <div className="row">
                <button type="submit" className="btn btn-danger" disabled={busy}>
                  {busy ? 'กำลังเปิดประกาศ…' : 'ยืนยันเปิดประกาศใหม่'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setReopening(false)}>ยกเลิก</button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="stack" aria-labelledby="sightings-h">
        <h2 id="sightings-h">เบาะแส {sightings.length} รายการ</h2>
        {sightings.length === 0 && <p className="meta">ยังไม่มีเบาะแสเข้ามา</p>}
        <ol className="timeline">
          {timeline.map((s) => (
            <li key={s.id} className="timeline-item">
              <p className="meta"><strong>{agoTh(s.seen_at)}</strong> · {dateTimeTh(s.seen_at)}</p>
              <p>{s.finder_display_name} · {s.district}{s.area_note ? ` ${s.area_note}` : ''}</p>
              {s.thumb_url && (
                <a href={s.photo_url ?? s.thumb_url}>
                  <img src={s.thumb_url} className="sighting-photo" loading="lazy"
                       alt={`ภาพที่ ${s.finder_display_name} ถ่ายไว้ที่${s.district}`} />
                </a>
              )}
              {s.note && <p>“{s.note}”</p>}
            </li>
          ))}
        </ol>
      </section>

      {events.length > 0 && (
        <section className="stack" aria-labelledby="events-h">
          <h2 id="events-h">ประวัติสถานะ</h2>
          <ul className="events">
            {[...events].reverse().map((e, i) => (
              <li key={i}>
                <span className="meta">{dateTimeTh(e.created_at)}</span> {STATUS_TH[e.to_status]}
                {e.reason ? ` — ${e.reason}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
