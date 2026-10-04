import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { useFormError } from '../lib/useFormError'

export function Login() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const { setError, bannerError, fieldMessage } = useFormError(['email', 'password'])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setUser(await api.login({ email, password }))
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught as ApiError)
      // ไม่บอกว่าผิดช่องไหน: ข้อความรวม + กลับไปที่ช่องอีเมลเสมอ
      document.getElementById('email')?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-grid">
      <form onSubmit={submit} className="card stack" noValidate>
        <h1>เข้าสู่ระบบ</h1>
        <ErrorBanner error={bannerError} />
        <Field id="email" label="อีเมล" error={fieldMessage('email')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field id="password" label="รหัสผ่าน" error={fieldMessage('password')}>
          <input type={show ? 'text' : 'password'} value={password}
                 onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> แสดงรหัสผ่าน
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        <p>ยังไม่มีบัญชี? <Link to="/register" state={{ from }}>สมัครสมาชิก</Link></p>
      </form>
      <aside className="why">
        <h2>ทำไมต้องเข้าสู่ระบบก่อนส่งเบาะแส</h2>
        <p>เพื่อให้เจ้าของตอบกลับคุณได้โดยไม่ต้องเปิดเบอร์โทรของใครเลย</p>
      </aside>
    </div>
  )
}
