import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** กรอบร่วมของหน้าเข้าสู่ระบบ/สมัครสมาชิก — แท็บสลับสองหน้าโดยจำหน้าที่จะกลับไปไว้ */
export function AuthShell({ mode, from, title, lead, children }: {
  mode: 'login' | 'register'; from: string; title: string; lead: string; children: ReactNode
}) {
  return (
    <section className="auth stack">
      <div className="card stack">
        <nav className="auth-tabs" aria-label="เข้าสู่ระบบหรือสมัครสมาชิก">
          <Link to="/login" state={{ from }} aria-current={mode === 'login' ? 'page' : undefined}>เข้าสู่ระบบ</Link>
          <Link to="/register" state={{ from }} aria-current={mode === 'register' ? 'page' : undefined}>สมัครสมาชิก</Link>
        </nav>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: '1.5rem' }}>{title}</h1>
          <p className="meta">{lead}</p>
        </div>
        {children}
      </div>
      <p className="meta" style={{ textAlign: 'center' }}>
        ทำไมต้องมีบัญชีก่อนส่งเบาะแส: เพื่อให้เจ้าของตอบกลับคุณได้โดยไม่ต้องเปิดเบอร์โทรของใครเลย ระบบไม่ขอเบอร์โทร ที่อยู่ หรือไลน์ไอดี
      </p>
    </section>
  )
}

/** ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน — รับ id/aria-* ที่ Field ส่งมาแล้วส่งต่อให้ input */
export function PasswordInput({ value, onChange, autoComplete, ...rest }: {
  value: string; onChange: (v: string) => void; autoComplete: string; [aria: string]: unknown
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="pw">
      <input {...rest} type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
             onChange={(e) => onChange(e.target.value)} style={{ paddingRight: 72 }} />
      <button type="button" onClick={() => setShow(!show)} aria-pressed={show}>{show ? 'ซ่อน' : 'แสดง'}</button>
    </div>
  )
}
