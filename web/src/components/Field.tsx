import { cloneElement, type ReactElement } from 'react'

interface Props {
  id: string
  label: string
  hint?: string
  error?: string | null
  /** ช่องเดียว (input/textarea/select) — Field ใส่ id, aria-invalid, aria-describedby ให้ */
  children: ReactElement<Record<string, unknown>>
}

/** label + ช่อง + helper + ข้อความ error ใต้ช่อง (icon + ข้อความ + กรอบหนาขึ้น ไม่ใช่สีอย่างเดียว) */
export function Field({ id, label, hint, error, children }: Props) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error && (
        <p id={`${id}-error`} role="alert" className="field-error">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}
    </div>
  )
}
