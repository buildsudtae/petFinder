import { useRef, useState } from 'react'

import { ApiError, request } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { DISTRICTS } from '../lib/labels'
import { useFormError } from '../lib/useFormError'
import { uuid } from '../lib/uuid'

interface Props {
  reportId: string
  /** เรียกเมื่อส่งสำเร็จ (201 หรือ 200 จาก replay) — หน้าที่ใช้ฟอร์มนี้เป็นคนพากลับไปรายละเอียด */
  onSent?: () => void
  /** 401: หน้าที่ใช้ฟอร์มพาไป login; ฟอร์มเก็บสิ่งที่พิมพ์ไว้ใน sessionStorage ก่อนเรียก */
  onAuthRequired?: () => void
}

const FIELDS = ['district', 'area_note', 'note', 'photo']
const draftKey = (reportId: string) => `pettech.draft.sighting.${reportId}`

function readDraft(reportId: string): { district: string; areaNote: string; note: string } | null {
  try {
    const raw = sessionStorage.getItem(draftKey(reportId))
    sessionStorage.removeItem(draftKey(reportId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function NewSighting({ reportId, onSent, onAuthRequired }: Props) {
  const [draft] = useState(() => readDraft(reportId))
  const [note, setNote] = useState(draft?.note ?? '')
  const [district, setDistrict] = useState(draft?.district ?? '')
  const [areaNote, setAreaNote] = useState(draft?.areaNote ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [closed, setClosed] = useState(false)
  const { error, setError, bannerError, fieldMessage } = useFormError(FIELDS)
  const photoInput = useRef<HTMLInputElement>(null)
  // key เดิมตลอดอายุฟอร์ม: กดซ้ำ/เน็ตกระตุกแล้วส่งใหม่ ต้องไม่เกิดเบาะแสซ้ำ
  const idemKey = useRef(uuid())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (sending || closed) return
    setSending(true)
    setError(null)
    const form = new FormData()
    form.set('seen_at', new Date().toISOString())
    form.set('district', district)
    form.set('note', note)
    if (areaNote) form.set('area_note', areaNote)
    if (photo) form.set('photo', photo)

    try {
      await request(`/api/reports/${reportId}/sightings`, {
        method: 'POST',
        body: form,
        headers: { 'Idempotency-Key': idemKey.current },
      })
      setNote('')
      setPhoto(null)
      if (photoInput.current) photoInput.current.value = ''
      setSent(true)
      onSent?.()
    } catch (caught) {
      const apiError = caught as ApiError   // ไม่ล้างฟอร์มเมื่อ error — ข้อความที่พิมพ์ต้องยังอยู่
      if (apiError.code === 'REPORT_CLOSED') setClosed(true)
      if (apiError.code === 'AUTH_REQUIRED' && onAuthRequired) {
        try {
          sessionStorage.setItem(draftKey(reportId), JSON.stringify({ district, areaNote, note }))
        } catch { /* storage ถูกบล็อก: ยอมให้พิมพ์ใหม่ดีกว่าไม่ได้ไปต่อ */ }
        onAuthRequired()
      } else {
        if (apiError.field === 'photo') {
          // ห้ามปล่อยชื่อไฟล์ค้างให้เข้าใจว่าแนบสำเร็จ
          setPhoto(null)
          if (photoInput.current) photoInput.current.value = ''
        }
        setError(apiError)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <ErrorBanner error={bannerError} />
      {error?.code === 'REPORT_CLOSED' && (
        <a className="closed-link" href={`/reports?district=${encodeURIComponent(district)}`}>ดูประกาศอื่นในเขตนี้</a>
      )}
      {sent && !onSent && <p role="status" className="success">ส่งเบาะแสแล้ว ขอบคุณที่ช่วยตามหา</p>}

      <Field id="photo" label="รูปที่ถ่ายได้ (ถ้ามี)" error={fieldMessage('photo')}
             hint="รับเฉพาะไฟล์รูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 5 MB">
        <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp"
               onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </Field>

      <Field id="district" label="เขต" error={fieldMessage('district')}>
        <input value={district} onChange={(e) => setDistrict(e.target.value)} list="districts"
               autoComplete="off" aria-required="true" />
      </Field>

      <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>

      <Field id="area_note" label="จุดสังเกต" error={fieldMessage('area_note')}
             hint="เช่น หน้าร้านสะดวกซื้อ ปากซอย 5">
        <input value={areaNote} onChange={(e) => setAreaNote(e.target.value)} maxLength={200} />
      </Field>

      <Field id="note" label="รายละเอียดที่พบ" error={fieldMessage('note')}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} />
      </Field>
      <p className="counter" aria-hidden="true">{note.length}/1000</p>

      <button type="submit" className="btn btn-primary" disabled={sending || closed}>
        {closed ? 'ประกาศนี้ปิดรับเบาะแสแล้ว' : sending ? 'กำลังส่ง…' : 'ส่งเบาะแส'}
      </button>
    </form>
  )
}
