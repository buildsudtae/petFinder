import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Message } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { myReportIds } from '../lib/mine'
import { dateTimeTh } from '../lib/time'
import { useFormError } from '../lib/useFormError'

const NOTICE_KEY = 'pettech.relay.notice.dismissed'

/** คุยผ่านระบบ — ทั้งสองฝ่ายไม่เห็นข้อมูลติดต่อของกัน */
export function Relay() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [noticeShown, setNoticeShown] = useState(() => {
    try { return localStorage.getItem(NOTICE_KEY) !== '1' } catch { return true }
  })
  const { setError, bannerError, fieldMessage } = useFormError(['body'])

  const load = useCallback(async () => {
    setLoadError(null)
    try { setMessages(await api.messages(id)) } catch (e) { setLoadError(e as ApiError); setMessages([]) }
  }, [id])

  useEffect(() => { void load() }, [load])

  const me = user?.display_name ?? ''
  const isOwner = !!user && myReportIds(user.id).includes(id)
  const others = new Set((messages ?? []).map((m) => m.sender_display_name).filter((n) => n !== me))

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.sendMessage(id, body)
      setBody('')
      await load()
    } catch (caught) {
      setError(caught as ApiError)
    } finally {
      setBusy(false)
    }
  }

  function dismissNotice() {
    setNoticeShown(false)
    try { localStorage.setItem(NOTICE_KEY, '1') } catch { /* ไม่เป็นไร: แถบจะโผล่อีกครั้ง */ }
  }

  return (
    <section className="stack">
      <Link to={`/reports/${id}`} className="back">← กลับไปประกาศ</Link>
      <h1>คุยผ่านระบบ</h1>

      {noticeShown && (
        <div className="card notice">
          <p><span aria-hidden="true">ⓘ</span> คุยผ่านระบบ ทั้งสองฝ่ายไม่เห็นเบอร์โทรของกันและกัน</p>
          <button type="button" className="btn btn-quiet" onClick={dismissNotice}>ปิด</button>
        </div>
      )}

      {/* ข้อจำกัดของ API: เจ้าของได้ทุกบทสนทนารวมกัน ไม่มี thread id แยกว่าข้อความไหนเป็นของใคร/ตอบใคร */}
      {isOwner && others.size > 1 && (
        <p className="card notice" role="note">
          มีผู้พบเห็น {others.size} คนส่งข้อความเข้ามา ข้อความทั้งหมดแสดงรวมกัน (ดูชื่อผู้ส่งกำกับ)
          ระบบยังตอบแยกรายคนไม่ได้ — เจ้าของตอบกลับได้เมื่อมีผู้พบเห็นเพียงคนเดียวที่ส่งเบาะแสไว้
        </p>
      )}

      <ErrorBanner error={loadError} onRetry={load} />
      {loadError?.code === 'FORBIDDEN' && <Link to={`/reports/${id}/sighting`}>ส่งเบาะแสในประกาศนี้</Link>}

      {messages === null && <p className="loading" role="status">กำลังโหลด…</p>}
      {messages?.length === 0 && !loadError && <p className="meta">ยังไม่มีข้อความ</p>}

      <ol className="thread" aria-label="ข้อความ">
        {(messages ?? []).map((m) => (
          <li key={m.id} className={m.sender_display_name === me ? 'msg msg-me' : 'msg'}>
            <p className="meta">{m.sender_display_name === me ? 'คุณ' : m.sender_display_name} · {dateTimeTh(m.created_at)}</p>
            <p className="bubble">{m.body}</p>
          </li>
        ))}
      </ol>

      <form onSubmit={send} className="stack" noValidate>
        <ErrorBanner error={bannerError} />
        <Field id="body" label="พิมพ์ข้อความ" error={fieldMessage('body')}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังส่ง…' : 'ส่ง'}</button>
        <button type="button" className="btn btn-quiet" onClick={load}>รีเฟรชข้อความ</button>
      </form>
    </section>
  )
}
