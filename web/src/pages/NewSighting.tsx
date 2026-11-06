import { useEffect, useMemo, useRef, useState } from 'react'

import { ApiError, request } from '../api/client'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { DISTRICTS } from '../lib/labels'
import { toLocalInput } from '../lib/time'
import { useFormError } from '../lib/useFormError'
import { uuid } from '../lib/uuid'

interface Props {
  reportId: string
  /** เขตของประกาศ ใช้เป็นค่าเริ่มต้นของช่องเขต */
  defaultDistrict?: string
  /** เรียกเมื่อส่งสำเร็จ (201 หรือ 200 จาก replay) — หน้าที่ใช้ฟอร์มนี้เป็นคนพากลับไปรายละเอียด */
  onSent?: () => void
  /** 401: หน้าที่ใช้ฟอร์มพาไป login; ฟอร์มเก็บสิ่งที่พิมพ์ไว้ใน sessionStorage ก่อนเรียก */
  onAuthRequired?: () => void
}

const FIELDS = ['district', 'area_note', 'note', 'photo', 'seen_at']
const WHEN = [['now', 'เมื่อกี้'], ['30', '30 นาทีก่อน'], ['60', '1 ชม.ก่อน'], ['custom', 'ระบุเอง']] as const
type When = typeof WHEN[number][0]
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

function seenAt(when: When, custom: string): string {
  if (when === 'custom' && custom) return new Date(custom).toISOString()
  const minutes = when === '30' ? 30 : when === '60' ? 60 : 0
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function NewSighting({ reportId, defaultDistrict = '', onSent, onAuthRequired }: Props) {
  const [draft] = useState(() => readDraft(reportId))
  const [note, setNote] = useState(draft?.note ?? '')
  const [district, setDistrict] = useState(draft?.district ?? defaultDistrict)
  const [areaNote, setAreaNote] = useState(draft?.areaNote ?? '')
  const [when, setWhen] = useState<When>('now')
  const [custom, setCustom] = useState(() => toLocalInput(new Date()))
  const [photo, setPhoto] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [closed, setClosed] = useState(false)
  const { error, setError, bannerError, fieldMessage } = useFormError(FIELDS)
  const photoInput = useRef<HTMLInputElement>(null)
  // key เดิมตลอดอายุฟอร์ม: กดซ้ำ/เน็ตกระตุกแล้วส่งใหม่ ต้องไม่เกิดเบาะแสซ้ำ (C4)
  const idemKey = useRef(uuid())

  const preview = useMemo(
    () => (photo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function clearPhoto() {
    setPhoto(null)
    if (photoInput.current) photoInput.current.value = ''
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (sending || closed) return
    setSending(true)
    setError(null)
    const form = new FormData()
    form.set('seen_at', seenAt(when, custom))
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
      clearPhoto()
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
        if (apiError.field === 'photo') clearPhoto()   // ห้ามปล่อยรูปค้างให้เข้าใจว่าแนบสำเร็จ
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
        <a className="btn btn-line" href={`/?district=${encodeURIComponent(district)}`}>ดูประกาศอื่นในเขตนี้</a>
      )}
      {sent && !onSent && <p role="status" className="success">ส่งเบาะแสแล้ว ขอบคุณที่ช่วยตามหา</p>}

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 6 }}>เห็นเมื่อไหร่</legend>
        <div className="seg" role="group" aria-label="เห็นเมื่อไหร่">
          {WHEN.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={when === v} disabled={closed} onClick={() => setWhen(v)}>{label}</button>
          ))}
        </div>
        {when === 'custom' && (
          <Field id="seen_at" label="วันเวลาที่เห็น" error={fieldMessage('seen_at')}>
            <input type="datetime-local" value={custom} max={toLocalInput(new Date())}
                   onChange={(e) => setCustom(e.target.value)} />
          </Field>
        )}
      </fieldset>

      <Field id="district" label="เขต" error={fieldMessage('district')} hint="เลือกจากรายการ 50 เขต หรือพิมพ์ชื่อเขต">
        <input value={district} onChange={(e) => setDistrict(e.target.value)} list="districts"
               autoComplete="off" aria-required="true" readOnly={closed} />
      </Field>
      <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>

      <Field id="area_note" label="จุดสังเกต" error={fieldMessage('area_note')}
             hint="ซอย ย่าน หรือจุดสังเกต เช่น หน้าร้านสะดวกซื้อ ปากซอย 5 ไม่ต้องบอกบ้านเลขที่">
        <input value={areaNote} onChange={(e) => setAreaNote(e.target.value)} maxLength={200} readOnly={closed} />
      </Field>

      <Field id="note" label="รายละเอียดที่พบ" error={fieldMessage('note')}
             hint="อย่าใส่เบอร์โทร ไลน์ หรือบ้านเลขที่ ข้อความนี้ทุกคนเห็นได้">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} readOnly={closed} />
      </Field>
      <p className="counter" aria-hidden="true">{note.length}/1000</p>

      <Field id="photo" label="รูปที่ถ่ายได้ (ถ้ามี)" error={fieldMessage('photo')}
             hint="PNG, JPEG หรือ WebP ไม่เกิน 5 MB · ระบบลบตำแหน่งที่ฝังในรูปออกก่อนเก็บ">
        <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={closed}
               onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </Field>
      {photo && (
        <div className="drop">
          {preview && <img src={preview} alt="รูปที่เลือกไว้" />}
          <span className="meta ellipsis" style={{ flex: 1 }}>{photo.name}</span>
          <button type="button" className="btn btn-line" onClick={clearPhoto}>เอารูปออก</button>
        </div>
      )}

      <button type="submit" className="btn btn-brand btn-block" disabled={sending || closed}>
        {closed ? 'ประกาศนี้ปิดรับเบาะแสแล้ว' : sending ? 'กำลังส่ง…' : 'ส่งเบาะแส'}
      </button>
      <p className="meta" style={{ textAlign: 'center' }}>เน็ตหลุดแล้วกดส่งซ้ำจากหน้านี้ได้ ระบบนับเป็นเบาะแสรายการเดียว</p>
    </form>
  )
}
