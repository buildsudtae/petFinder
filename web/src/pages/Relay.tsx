import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Message, type Report, type Thread } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { initialOf } from '../lib/labels'
import { agoTh, dateTimeTh } from '../lib/time'
import { useFormError } from '../lib/useFormError'

/**
 * กล่องข้อความของประกาศ — คุยผ่านระบบ ทั้งสองฝ่ายไม่เห็นข้อมูลติดต่อของกัน (FR-07)
 * เจ้าของเห็นรายชื่อผู้พบเห็นแยกคน (thread) แล้วตอบทีละคน · ผู้พบเห็นเห็นเฉพาะบทสนทนาของตัวเอง
 */
export function Relay() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const [report, setReport] = useState<Report | null>(null)
  const [threads, setThreads] = useState<Thread[] | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const { setError, bannerError, fieldMessage } = useFormError(['body', 'thread_id'])

  const loadThreads = useCallback(async () => {
    setLoadError(null)
    try {
      const [r, t] = await Promise.all([api.report(id), api.threads(id)])
      setReport(r)
      setThreads(t)
      setCurrent((cur) => cur ?? t[0]?.id ?? null)
    } catch (e) {
      setLoadError(e as ApiError)
      setThreads([])
    }
  }, [id])

  const openThread = useCallback(async (threadId: string | null) => {
    setMessages(null)
    if (!threadId) { setMessages([]); return }
    try {
      setMessages(await api.messages(id, threadId))
      await api.markThreadRead(id, threadId)
      setThreads((list) => (list ?? []).map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)))
    } catch (e) {
      setLoadError(e as ApiError)
      setMessages([])
    }
  }, [id])

  useEffect(() => { void loadThreads() }, [loadThreads])
  const loaded = threads !== null
  useEffect(() => { if (loaded) void openThread(current) }, [current, loaded, openThread])

  const me = user?.display_name ?? ''
  const isOwner = report?.is_owner ?? false
  const thread = threads?.find((t) => t.id === current) ?? null
  const canWrite = isOwner ? !!thread : true   // ผู้พบเห็นที่ส่งเบาะแสแล้วเริ่มบทสนทนาได้เอง (ไม่งั้น API ตอบ 403)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.sendMessage(id, body, isOwner ? current ?? undefined : undefined)
      setBody('')
      // รายการบทสนทนา (ข้อความล่าสุด) ต้องอัปเดตด้วย ไม่ใช่แค่กล่องข้อความ
      if (!isOwner && !current) { await loadThreads() } else { await openThread(current); setThreads(await api.threads(id)) }
    } catch (caught) {
      setError(caught as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="stack">
      <Link to={`/reports/${id}`} className="back">← กลับไปประกาศ</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ fontSize: '1.875rem' }}>ข้อความเรื่อง {report?.pet_name ?? ''}</h1>
        <p className="meta">ระบบไม่แสดงเบอร์โทร อีเมล หรือที่อยู่ของใคร อย่าพิมพ์ส่งกันเองในแชท ถ้านัดรับ เลือกจุดที่มีคนพลุกพล่าน</p>
      </div>

      <ErrorBanner error={loadError} onRetry={loadThreads} />
      {loadError?.code === 'FORBIDDEN' && <Link to={`/reports/${id}/sighting`}>ส่งเบาะแสในประกาศนี้ก่อน แล้วจึงคุยกับเจ้าของได้</Link>}
      {threads === null && <p className="loading" role="status">กำลังโหลด…</p>}

      {threads !== null && (
        <div className={isOwner ? 'chat' : 'stack'}>
          {isOwner && (
            <nav aria-label="ผู้พบเห็นที่คุยด้วย" className="threads">
              {threads.length === 0 && <p className="meta">ยังไม่มีผู้พบเห็นทักมา บทสนทนาจะเริ่มเมื่อผู้ที่ส่งเบาะแสส่งข้อความหาคุณ</p>}
              {threads.map((t) => (
                <button key={t.id} type="button" className="thread" aria-current={t.id === current} onClick={() => setCurrent(t.id)}
                        aria-label={`${t.finder_display_name}${t.unread_count ? ` ข้อความใหม่ ${t.unread_count}` : ''}`}>
                  <span className="ava" aria-hidden="true">{initialOf(t.finder_display_name)}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <strong>{t.finder_display_name}</strong>
                      {t.last_message_at && <span className="caption">{agoTh(t.last_message_at)}</span>}
                    </span>
                    <span className="meta ellipsis" style={{ display: 'block' }}>
                      {t.last_message ? `${t.last_message_mine ? 'คุณ: ' : ''}${t.last_message}` : 'ยังไม่มีข้อความ'}
                    </span>
                    {t.sighting_district && <span className="caption">เบาะแส: {t.sighting_district}{t.sighting_area_note ? ` ${t.sighting_area_note}` : ''}</span>}
                  </span>
                  {t.unread_count > 0 && <span className="dot-new" aria-label={`${t.unread_count} ข้อความใหม่`} />}
                </button>
              ))}
            </nav>
          )}

          <div className="card convo">
            {isOwner && thread && <p><strong>{thread.finder_display_name}</strong> <span className="meta">ผู้พบเห็นแต่ละคนเห็นเฉพาะบทสนทนาของตัวเอง</span></p>}
            {messages === null && <p className="loading" role="status">กำลังโหลด…</p>}
            {messages?.length === 0 && <p className="meta">ยังไม่มีข้อความ</p>}
            <ol className="messages" aria-label="ข้อความ">
              {(messages ?? []).map((m) => {
                const mine = m.sender_display_name === me
                return (
                  <li key={m.id} className={mine ? 'bubble me' : 'bubble'}>
                    <p className="caption" style={{ color: 'inherit', opacity: 0.75 }}>{mine ? 'คุณ' : m.sender_display_name} · {dateTimeTh(m.created_at)}</p>
                    <p>{m.body}</p>
                  </li>
                )
              })}
            </ol>
            {canWrite && (
              <form onSubmit={send} className="stack" noValidate>
                <ErrorBanner error={bannerError} />
                <div className="composer">
                  <div style={{ flex: 1 }}>
                    <Field id="body" label="พิมพ์ข้อความ" error={fieldMessage('body')}>
                      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={2} />
                    </Field>
                  </div>
                  <button type="submit" className="btn btn-brand" disabled={busy || !body.trim()}>{busy ? 'กำลังส่ง…' : 'ส่ง'}</button>
                </div>
                <button type="button" className="btn btn-line" style={{ alignSelf: 'flex-start' }}
                        onClick={() => void openThread(current)}>รีเฟรชข้อความ</button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
