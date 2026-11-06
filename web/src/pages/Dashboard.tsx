import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { PetPhoto } from '../components/PetPhoto'
import { StatusPill } from '../components/StatusPill'
import { useToast } from '../components/Toast'
import { STATUS_TH } from '../lib/labels'
import { dateTimeTh } from '../lib/time'
import { useFormError } from '../lib/useFormError'

type Tab = 'open' | 'found' | 'all'
interface Extra { newLeads: number; unreadMessages: number }
type Ask = { kind: 'close' | 'reopen'; report: Report } | null

/**
 * ประกาศของฉัน — GET /api/reports?mine=true (ทุกสถานะ) ตามบัญชีที่ล็อกอิน
 * "ใหม่ N" = แจ้งเตือนเบาะแสที่ยังไม่ได้เปิดดู (มาจาก worker จึงตามหลังไม่กี่วินาที — C5)
 */
export function Dashboard() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [extra, setExtra] = useState<Record<string, Extra>>({})
  const [error, setError] = useState<ApiError | null>(null)
  const [tab, setTab] = useState<Tab>('open')
  const [ask, setAsk] = useState<Ask>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const reopenForm = useFormError(['reason'])
  const toast = useToast()

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, notes] = await Promise.all([api.reports({ mine: true, limit: 100 }), api.notifications()])
      setReports(list)
      const newLeads: Record<string, number> = {}
      for (const n of notes.items) {
        if (!n.read && n.topic === 'sighting.created' && n.report_id) newLeads[n.report_id] = (newLeads[n.report_id] ?? 0) + 1
      }
      // ข้อความที่ยังไม่อ่าน: นับจาก /threads ของประกาศที่มีเบาะแส (ประกาศอื่นยังคุยไม่ได้)
      const withThreads = list.filter((r) => r.sighting_count > 0).slice(0, 20)
      const threadLists = await Promise.all(withThreads.map((r) => api.threads(r.id).catch(() => [])))
      const next: Record<string, Extra> = {}
      for (const r of list) next[r.id] = { newLeads: newLeads[r.id] ?? 0, unreadMessages: 0 }
      withThreads.forEach((r, i) => { next[r.id].unreadMessages = threadLists[i].reduce((s, t) => s + t.unread_count, 0) })
      setExtra(next)
    } catch (e) {
      setError(e as ApiError)
      setReports((old) => old ?? [])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function confirm() {
    if (!ask) return
    setBusy(true)
    reopenForm.setError(null)
    try {
      const to = ask.kind === 'close' ? 'RESOLVED' : 'SEARCHING'
      const updated = await api.changeStatus(ask.report.id, to, to === 'SEARCHING' ? reason : undefined)
      setReports((list) => (list ?? []).map((r) => (r.id === updated.id ? updated : r)))
      toast.show(ask.kind === 'close' ? `ปิดประกาศ${updated.pet_name}แล้ว` : `เปิดประกาศ${updated.pet_name}ใหม่ สถานะ: ${STATUS_TH[updated.status]}`)
      setAsk(null)
      setReason('')
    } catch (e) {
      reopenForm.setError(e as ApiError)
    } finally {
      setBusy(false)
    }
  }

  const all = reports ?? []
  const open = all.filter((r) => r.status !== 'RESOLVED')
  const found = all.filter((r) => r.status === 'RESOLVED')
  const shown = tab === 'open' ? open : tab === 'found' ? found : all
  const TABS: [Tab, string, number][] = [['open', 'ตามหาอยู่', open.length], ['found', 'พบแล้ว', found.length], ['all', 'ทั้งหมด', all.length]]

  return (
    <section className="stack">
      <div className="list-head" style={{ paddingBottom: 0 }}>
        <h1>ประกาศของฉัน</h1>
        <Link to="/reports/new" className="btn btn-brand">แจ้งสัตว์หาย</Link>
      </div>
      <ErrorBanner error={error} onRetry={load} />

      <div className="tabs" role="tablist" aria-label="กรองตามสถานะ">
        {TABS.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label} <span className="mono">{reports ? n : ''}</span>
          </button>
        ))}
      </div>

      {reports === null && <p className="loading" role="status">กำลังโหลด…</p>}
      {reports && shown.length === 0 && !error && (
        <div className="empty">
          <p>{tab === 'found' ? 'ยังไม่มีประกาศที่พบแล้ว' : 'คุณยังไม่มีประกาศ — ถ้าสัตว์เลี้ยงหาย แจ้งได้ที่นี่'}</p>
          {tab !== 'found' && <Link to="/reports/new" className="btn btn-brand">แจ้งสัตว์หาย</Link>}
        </div>
      )}

      <ul className="mine-list">
        {shown.map((r) => {
          const x = extra[r.id] ?? { newLeads: 0, unreadMessages: 0 }
          const isOpen = r.status !== 'RESOLVED'
          return (
            <li key={r.id} className="card mine-item">
              <div className="mine-head">
                <PetPhoto url={r.photo_url} species={r.species} alt={`รูป${r.pet_name}`} className="pet-thumb" />
                <div className="stack" style={{ gap: 4, minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <StatusPill status={r.status} />
                    <span className="meta mono" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      {r.sighting_count} เบาะแส
                      {x.newLeads > 0 && <span className="new-badge">ใหม่ {x.newLeads}</span>}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1.125rem' }}>{r.pet_name}</h2>
                  <p className="meta">{r.district} · ประกาศเมื่อ {dateTimeTh(r.created_at)}</p>
                </div>
              </div>
              <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <Link to={`/reports/${r.id}`} className="btn btn-line">ดูประกาศ</Link>
                <Link to={`/reports/${r.id}/messages`} className="btn btn-line">
                  ข้อความ{x.unreadMessages > 0 && <span className="count-badge" aria-label={`${x.unreadMessages} ข้อความใหม่`}>{x.unreadMessages}</span>}
                </Link>
              </div>
              {isOpen
                ? <button type="button" className="btn btn-found" onClick={() => setAsk({ kind: 'close', report: r })}>เจอแล้ว ปิดประกาศ</button>
                : <button type="button" className="btn btn-line" onClick={() => setAsk({ kind: 'reopen', report: r })}>เปิดประกาศใหม่</button>}
            </li>
          )
        })}
      </ul>

      {ask && (
        <div className="scrim" role="presentation" onClick={() => setAsk(null)}>
          <form className="sheet" role={ask.kind === 'close' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="ask-h"
                noValidate onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void confirm() }}>
            <h2 id="ask-h">{ask.kind === 'close' ? `ปิดประกาศ${ask.report.pet_name}?` : `เปิดประกาศ${ask.report.pet_name}ใหม่`}</h2>
            <p className="meta">
              {ask.kind === 'close'
                ? 'ประกาศจะขึ้นว่าพบแล้ว หลุดจากรายการตามหา และไม่รับเบาะแสใหม่ เปิดใหม่ได้ภายหลังถ้าปิดผิด'
                : 'ถ้ามีเบาะแสเดิมอยู่ สถานะจะกลับเป็น "มีเบาะแส"'}
            </p>
            <ErrorBanner error={reopenForm.bannerError} />
            {ask.kind === 'reopen' && (
              <Field id="reason" label="เหตุผลที่เปิดประกาศใหม่" hint="ต้องกรอก เช่น ที่พบไม่ใช่ตัวเดิม · เห็นเฉพาะคุณ"
                     error={reopenForm.fieldMessage('reason')}>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
              </Field>
            )}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-line" onClick={() => setAsk(null)}>ยกเลิก</button>
              <button type="submit" className={ask.kind === 'close' ? 'btn btn-found' : 'btn btn-danger'} disabled={busy}>
                {busy ? 'กำลังบันทึก…' : ask.kind === 'close' ? 'ยืนยัน เจอแล้ว' : 'ยืนยันเปิดประกาศใหม่'}
              </button>
            </div>
          </form>
        </div>
      )}
      {toast.node}
    </section>
  )
}
