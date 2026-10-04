import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { useFormError } from '../lib/useFormError'

export function Register() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const { setError, bannerError, fieldMessage } = useFormError(['display_name', 'email', 'password'])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.register({ email, password, display_name: displayName })
      setUser(await api.login({ email, password }))     // register ไม่ตั้ง cookie — เข้าสู่ระบบต่อทันที
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught as ApiError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-grid">
      <form onSubmit={submit} className="card stack" noValidate>
        <h1>สมัครสมาชิก</h1>
        <ErrorBanner error={bannerError} />
        <Field id="display_name" label="ชื่อที่แสดง" hint="ผู้อื่นจะเห็นเฉพาะชื่อนี้ ไม่เห็นอีเมลหรือเบอร์โทร"
               error={fieldMessage('display_name')}>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="nickname" />
        </Field>
        <Field id="email" label="อีเมล" error={fieldMessage('email')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field id="password" label="รหัสผ่าน" hint="อย่างน้อย 10 ตัวอักษร" error={fieldMessage('password')}>
          <input type={show ? 'text' : 'password'} value={password}
                 onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> แสดงรหัสผ่าน
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}</button>
        <p>มีบัญชีอยู่แล้ว? <Link to="/login" state={{ from }}>เข้าสู่ระบบ</Link></p>
      </form>
      <aside className="why">
        <h2>ทำไมต้องสมัครก่อนส่งเบาะแส</h2>
        <p>เพื่อให้เจ้าของตอบกลับคุณได้โดยไม่ต้องเปิดเบอร์โทรของใครเลย</p>
      </aside>
    </div>
  )
}
