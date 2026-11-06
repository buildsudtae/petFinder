import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { api } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { Field } from '../components/Field'
import { useFormError } from '../lib/useFormError'
import { AuthShell, PasswordInput } from './AuthShell'

export function Register() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <AuthShell mode="register" from={from} title="สมัครสมาชิก" lead="ใช้เวลาไม่ถึงนาที ผู้อื่นจะเห็นเฉพาะชื่อที่แสดงของคุณ">
      <form onSubmit={submit} className="stack" noValidate>
        <ErrorBanner error={bannerError} />
        <Field id="display_name" label="ชื่อที่แสดง" hint="ผู้อื่นจะเห็นเฉพาะชื่อนี้ ไม่เห็นอีเมลหรือเบอร์โทร"
               error={fieldMessage('display_name')}>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} autoComplete="nickname" />
        </Field>
        <Field id="email" label="อีเมล" hint="ใช้เข้าสู่ระบบเท่านั้น ไม่แสดงให้ใครเห็น" error={fieldMessage('email')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field id="password" label="รหัสผ่าน" hint="อย่างน้อย 10 ตัวอักษร" error={fieldMessage('password')}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <button type="submit" className="btn btn-brand btn-block" disabled={busy}>{busy ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}</button>
      </form>
    </AuthShell>
  )
}
