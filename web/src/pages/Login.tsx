import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { useFormError } from '../lib/useFormError'
import { AuthShell, PasswordInput } from './AuthShell'

export function Login() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <AuthShell mode="login" from={from} title="ยินดีต้อนรับกลับ" lead="ดูประกาศได้โดยไม่ต้องเข้าสู่ระบบ ส่วนการลงประกาศและส่งเบาะแสต้องมีบัญชี">
      <form onSubmit={submit} className="stack" noValidate>
        <ErrorBanner error={bannerError} />
        <Field id="email" label="อีเมล" error={fieldMessage('email')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field id="password" label="รหัสผ่าน" error={fieldMessage('password')}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <button type="submit" className="btn btn-brand btn-block" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
      </form>
    </AuthShell>
  )
}
