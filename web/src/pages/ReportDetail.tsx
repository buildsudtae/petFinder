import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report, type ReportEvent, type Sighting } from '../api/endpoints'
import { useAuth } from '../auth'
import { ElapsedClock } from '../components/ElapsedClock'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { DistrictMiniMap } from '../components/DistrictMiniMap'
import { CheckIcon } from '../components/Icons'
import { PetPhoto } from '../components/PetPhoto'
import { StatusPill } from '../components/StatusPill'
import { useToast } from '../components/Toast'
import { SPECIES_TH, STATUS_TH, initialOf } from '../lib/labels'
import { agoTh, dateTh, dateTimeTh, timeTh } from '../lib/time'
import { useFormError } from '../lib/useFormError'

type Sheet = 'close' | 'reopen' | null

export function ReportDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [events, setEvents] = useState<ReportEvent[]>([])
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const reopenForm = useFormError(['reason'])
  const toast = useToast()

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const [r, s] = await Promise.all([api.report(id), api.sightings(id)])
      setReport(r)
      setSightings(s)
      // ประวัติสถานะ (มีเหตุผลที่เจ้าของพิมพ์) ขอเฉพาะเจ้าของ — คนอื่นได้ 403 จากเซิร์ฟเวอร์
      setEvents(r.is_owner ? await api.events(id) : [])
      // เจ้าของเปิดดูประกาศแล้ว = เห็นเบาะแสใหม่แล้ว (ตัวเลขใน "ประกาศของฉัน" ลดลง)
      if (r.is_owner) api.markNotificationsRead(id).catch(() => undefined)
    } catch (caught) {
      setLoadError(caught as ApiError)
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  // ข้อความยืนยันจากหน้าก่อน (เช่นส่งเบาะแสแล้ว) แสดงที่ Layout — เบาะแสใหม่ใน timeline คือหลักฐานที่ค้างบนหน้า

  if (loadError && !report) {
    return (
      <section className="stack">
        <Link to="/" className="back">← ประกาศทั้งหมด</Link>
        <ErrorBanner error={loadError} onRetry={load} />
      </section>
    )
  }
  if (!report) return <p className="loading" role="status">กำลังโหลด…</p>

  const isOwner = report.is_owner   // มาจากเซิร์ฟเวอร์ (คุกกี้ของผู้เรียก) ไม่ใช่ที่เก็บในเบราว์เซอร์
  const resolved = report.status === 'RESOLVED'
  const resolvedAt = resolved ? report.resolved_at ?? null : null
  const firstSighting = sightings[0]?.created_at ?? null       // timeline เรียงเก่าไปใหม่
  const desc = [SPECIES_TH[report.species], report.color].filter(Boolean).join(' · ')
  const timeline = [...sightings].reverse()                    // ใหม่สุดอยู่บนสุด
  const days = groupByDay(timeline)

  async function change(to: 'RESOLVED' | 'SEARCHING') {
    setBusy(true)
    setActionError(null)
    reopenForm.setError(null)
    try {
      const updated = await api.changeStatus(report!.id, to, to === 'SEARCHING' ? reason : undefined)
      setReport(updated)
      setEvents(await api.events(report!.id))
      setSheet(null)
      setReason('')
      toast.show(to === 'RESOLVED' ? 'ปิดประกาศแล้ว ระบบหยุดรับเบาะแสใหม่' : `เปิดประกาศใหม่แล้ว สถานะ: ${STATUS_TH[updated.status]}`)
    } catch (caught) {
      const err = caught as ApiError
      if (to === 'SEARCHING') reopenForm.setError(err)
      else { setActionError(err); setSheet(null) }
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `ตามหา ${report!.pet_name}`, url })
      else { await navigator.clipboard.writeText(url); toast.show('คัดลอกลิงก์ประกาศแล้ว') }
    } catch { /* ผู้ใช้ยกเลิกการแชร์ */ }
  }

  return (
    <article className="stack" style={{ gap: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Link to="/" className="back">← ประกาศทั้งหมด</Link>
        <button type="button" className="btn btn-line" onClick={share}>แชร์ประกาศ</button>
      </div>

      <div className="detail">
        <div className="detail-side">
          <div className="gallery photo-box">
            <PetPhoto url={report.photo_url} species={report.species} alt={`รูป${report.pet_name} ${desc}`} />
            {resolved && (
              <span className="stamp" aria-hidden="true">พบแล้ว{resolvedAt ? ` · ${dateTh(resolvedAt)}` : ''}</span>
            )}
          </div>

          {resolved && (
            <div className="banner-found" role="status">
              <CheckIcon />
              <p><strong>เจ้าของพบสัตว์แล้ว</strong> ไม่ต้องแชร์ประกาศนี้ต่อ และระบบไม่รับเบาะแสใหม่</p>
            </div>
          )}

          {!isOwner && !resolved && user && (
            <Link to={`/reports/${report.id}/sighting`} className="btn btn-brand btn-block">ส่งเบาะแสที่พบ</Link>
          )}
          {!isOwner && !resolved && !user && (
            <Link to="/login" state={{ from: `/reports/${report.id}/sighting` }} className="btn btn-brand btn-block">
              เข้าสู่ระบบเพื่อส่งเบาะแส
            </Link>
          )}
          {!isOwner && resolved && (
            <button type="button" className="btn btn-brand btn-block" disabled>ประกาศนี้ปิดรับเบาะแสแล้ว</button>
          )}
          {user && (
            <Link to={`/reports/${report.id}/messages`} className="btn btn-line btn-block">
              {isOwner ? 'กล่องข้อความจากผู้พบเห็น' : 'คุยกับเจ้าของ'}
            </Link>
          )}
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row">
              <StatusPill status={report.status} count={report.status === 'HAS_LEAD' ? report.sighting_count : undefined} />
              <span className="meta">ประกาศเมื่อ {dateTimeTh(report.created_at)}</span>
            </div>
            <h1>{report.pet_name}</h1>
            <p className="meta">{desc} · หายที่{report.district}</p>
          </div>

          {/* ประกาศที่ปิดแล้วแต่ไม่รู้เวลาปิดห้ามให้นาฬิกาเดินต่อ */}
          {!(resolved && !resolvedAt) && <ElapsedClock since={report.last_seen_at} until={resolvedAt} />}

          <section className="card stack" aria-labelledby="track-h">
            <h2 id="track-h" style={{ fontSize: '1.125rem' }}>สถานะประกาศ</h2>
            <ol className="tracker">
              <li className="done">
                <span className="step-dot" aria-hidden="true">✓</span>
                <div><p style={{ fontWeight: 600 }}>แจ้งหาย</p><p className="meta mono">{dateTimeTh(report.created_at)}</p></div>
              </li>
              <li className={firstSighting ? 'done' : ''}>
                <span className="step-dot" aria-hidden="true">{firstSighting ? '✓' : ''}</span>
                <div>
                  <p style={{ fontWeight: 600 }}>มีเบาะแสแรก</p>
                  <p className="meta">{firstSighting ? <span className="mono">{dateTimeTh(firstSighting)}</span> : 'ระบบเปลี่ยนสถานะให้เองเมื่อมีเบาะแสแรก'}</p>
                </div>
              </li>
              <li className={resolved ? 'done final' : ''}>
                <span className="step-dot" aria-hidden="true">{resolved ? '✓' : ''}</span>
                <div>
                  <p style={{ fontWeight: 600 }}>พบแล้ว</p>
                  <p className="meta">{resolvedAt ? <span className="mono">{dateTimeTh(resolvedAt)}</span> : 'เจ้าของเป็นคนกดปิดเมื่อพบสัตว์'}</p>
                </div>
              </li>
            </ol>
          </section>

          {isOwner && (
            <section className="owner-panel" aria-labelledby="owner-h">
              <h2 id="owner-h" style={{ fontSize: '1.125rem' }}>ประกาศของคุณ</h2>
              <ErrorBanner error={actionError} />
              {!resolved && (
                <button type="button" className="btn btn-found" disabled={busy} onClick={() => setSheet('close')}>
                  เจอแล้ว ปิดประกาศ
                </button>
              )}
              {resolved && (
                <button type="button" className="btn btn-danger" onClick={() => setSheet('reopen')}>เปิดประกาศใหม่</button>
              )}
              {events.length > 0 && (
                <div className="stack" style={{ gap: 4 }}>
                  <h3 style={{ fontSize: '1rem' }}>ประวัติสถานะ <span className="meta">(เห็นเฉพาะคุณ)</span></h3>
                  <ul className="events">
                    {[...events].reverse().map((e, i) => (
                      <li key={i}>
                        <span>{STATUS_TH[e.to_status]}{e.reason ? ` — ${e.reason}` : ''}</span>
                        <span className="meta mono">{dateTimeTh(e.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="stack" aria-labelledby="facts-h">
            <h2 id="facts-h" style={{ fontSize: '1.125rem' }}>รายละเอียด</h2>
            <dl className="dl">
              <dt>ชนิด</dt><dd>{SPECIES_TH[report.species]}</dd>
              {report.color && <><dt>สีและลักษณะ</dt><dd>{report.color}</dd></>}
              {report.marks && <><dt>จุดสังเกต</dt><dd>{report.marks}</dd></>}
              <dt>เห็นครั้งสุดท้าย</dt>
              <dd><span className="mono">{dateTimeTh(report.last_seen_at)}</span> · {report.district}{report.area_note ? ` ${report.area_note}` : ''}</dd>
            </dl>
            <DistrictMiniMap district={report.district} sightingDistricts={sightings.map((s) => s.district)} />
            {report.description && (
              <div className="card"><p className="caption">ข้อความจากเจ้าของ</p><p>{report.description}</p></div>
            )}
          </section>

          <section className="stack" aria-labelledby="sightings-h">
            <h2 id="sightings-h" style={{ fontSize: '1.125rem' }}>เบาะแส {sightings.length} รายการ</h2>
            {sightings.length === 0 && <p className="meta">ยังไม่มีเบาะแสเข้ามา ถ้าคุณเห็นสัตว์ตัวนี้ ส่งเบาะแสได้เลย</p>}
            <div className="timeline">
              {days.map(([day, list]) => (
                <div key={day} className="stack" style={{ gap: 12 }}>
                  <p className="tl-day">{day}</p>
                  {list.map((s) => (
                    <div key={s.id} className="tl-item">
                      <span className="ava" aria-hidden="true">{initialOf(s.finder_display_name)}</span>
                      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                        <p><strong>{s.finder_display_name}</strong> <span className="meta">ส่งเบาะแสที่ {s.district}{s.area_note ? ` ${s.area_note}` : ''}</span></p>
                        <p className="meta"><span className="mono">{timeTh(s.seen_at)}</span> · เห็นเมื่อ {agoTh(s.seen_at)}</p>
                        {s.note && <p>{s.note}</p>}
                        {(s.thumb_url ?? s.photo_url) && (
                          <a href={s.photo_url ?? s.thumb_url ?? undefined}>
                            <img src={(s.thumb_url ?? s.photo_url) as string} className="sighting-photo" loading="lazy"
                                 alt={`ภาพที่ ${s.finder_display_name} ถ่ายไว้ที่${s.district}`} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="meta">แสดงเฉพาะชื่อที่ผู้ส่งตั้งไว้ ไม่มีเบอร์โทรหรืออีเมล</p>
          </section>
        </div>
      </div>

      {sheet === 'close' && (
        <div className="scrim" role="presentation" onClick={() => setSheet(null)}>
          <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="close-h" onClick={(e) => e.stopPropagation()}>
            <h2 id="close-h">ปิดประกาศ{report.pet_name}?</h2>
            <p className="meta">ประกาศจะขึ้นว่าพบแล้ว หลุดจากรายการตามหา และไม่รับเบาะแสใหม่ เปิดใหม่ได้ภายหลังถ้าปิดผิด</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-line" onClick={() => setSheet(null)}>ยกเลิก</button>
              <button type="button" className="btn btn-found" disabled={busy} onClick={() => void change('RESOLVED')}>
                {busy ? 'กำลังปิดประกาศ…' : 'ยืนยัน เจอแล้ว'}
              </button>
            </div>
          </div>
        </div>
      )}
      {sheet === 'reopen' && (
        <div className="scrim" role="presentation" onClick={() => setSheet(null)}>
          <form className="sheet" role="dialog" aria-modal="true" aria-labelledby="reopen-h" noValidate
                onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void change('SEARCHING') }}>
            <h2 id="reopen-h">เปิดประกาศใหม่</h2>
            <p className="meta">ถ้ามีเบาะแสเดิมอยู่ สถานะจะกลับเป็น "มีเบาะแส"</p>
            <ErrorBanner error={reopenForm.bannerError} />
            <Field id="reason" label="เหตุผลที่เปิดประกาศใหม่" hint="ต้องกรอก เช่น ที่พบไม่ใช่ตัวเดิม · เห็นเฉพาะคุณ"
                   error={reopenForm.fieldMessage('reason')}>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-line" onClick={() => setSheet(null)}>ยกเลิก</button>
              <button type="submit" className="btn btn-danger" disabled={busy}>{busy ? 'กำลังเปิดประกาศ…' : 'ยืนยันเปิดประกาศใหม่'}</button>
            </div>
          </form>
        </div>
      )}
      {toast.node}
    </article>
  )
}

function groupByDay(list: Sighting[]): [string, Sighting[]][] {
  const out: [string, Sighting[]][] = []
  for (const s of list) {
    const day = new Date(s.created_at).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })
    const last = out[out.length - 1]
    if (last && last[0] === day) last[1].push(s)
    else out.push([day, [s]])
  }
  return out
}
