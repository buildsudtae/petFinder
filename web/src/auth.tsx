import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { api, type User } from './api/endpoints'

interface AuthValue {
  user: User | null
  ready: boolean
  setUser: (u: User | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // 401 ตอนยังไม่ล็อกอินเป็นเรื่องปกติ ไม่ใช่ error
    api.me().then(setUser, () => setUser(null)).finally(() => setReady(true))
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } finally { setUser(null) }
  }, [])

  const value = useMemo(() => ({ user, ready, setUser, logout }), [user, ready, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth ต้องอยู่ใต้ AuthProvider')
  return ctx
}

/** หน้าที่ต้องล็อกอิน: พาไป /login พร้อมจำหน้าเดิมไว้ให้กลับมาหลังเข้าสู่ระบบ */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <p className="loading" role="status">กำลังโหลด…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
