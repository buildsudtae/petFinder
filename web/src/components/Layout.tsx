import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { api, NOTIFICATIONS_CHANGED } from '../api/endpoints'
import { useAuth } from '../auth'
import { initialOf } from '../lib/labels'
import { Logo, PlusIcon } from './Icons'
import { useToast } from './Toast'

export function Layout() {
  const { user, ready, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [askLogout, setAskLogout] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuBtn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const cancelBtn = useRef<HTMLButtonElement>(null)

  // แจ้งเตือนมาจาก worker หลังเหตุการณ์ไม่กี่วินาที (C5) — อ่านใหม่ทุกครั้งที่เปลี่ยนหน้า
  // และทันทีที่หน้าไหนบอกว่าอ่านแล้ว (เช่นเจ้าของเปิดดูประกาศ) ไม่ให้ badge ค้างตัวเลขเก่า
  const refreshUnread = useCallback(() => {
    if (!user) { setUnread(0); return }
    api.notifications().then((n) => setUnread(n.unread_count), () => setUnread(0))
  }, [user])
  useEffect(refreshUnread, [refreshUnread, location.pathname])
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshUnread)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refreshUnread)
  }, [refreshUnread])

  // ข้อความยืนยันจากหน้าก่อน (เข้าสู่ระบบแล้ว, ส่งเบาะแสแล้ว) — แสดงครั้งเดียวแล้วล้างออกจาก history
  // ไม่ให้กดย้อนกลับ/รีเฟรชแล้วขึ้นซ้ำ ผลที่ค้างบนหน้าจริงคือชื่อในเมนูบัญชีหรือเบาะแสใน timeline
  const flash = (location.state as { flash?: string } | null)?.flash
  const showToast = toast.show
  useEffect(() => {
    if (!flash) return
    showToast(flash)
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null })
  }, [flash, showToast, navigate, location.pathname, location.search, location.hash])

  useEffect(() => { setMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !menuBtn.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtn.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  useEffect(() => {
    if (!askLogout) return
    cancelBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAskLogout(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [askLogout])

  function confirmLogout() {
    setMenuOpen(false)
    setAskLogout(true)
  }

  async function signOut() {
    setBusy(true)
    try {
      await logout()
    } finally {
      setBusy(false)
      setAskLogout(false)
    }
    navigate('/', { state: { flash: 'ออกจากระบบแล้ว' } })
  }

  return (
    <>
      <a href="#main" className="skip-link">ข้ามไปยังเนื้อหา</a>
      <header className="top">
        <div className="wrap top-in">
          <Link to="/" className="brand" aria-label="La peace หน้าแรก"><Logo />La peace</Link>
          <nav aria-label="เมนูหลัก" className="navs">
            <NavLink to="/" end className="navl hide-sm">ประกาศ</NavLink>
            <NavLink to="/map" className="navl hide-sm">แผนที่</NavLink>
            {ready && user && (
              <NavLink to="/me/reports" className="navl">
                ประกาศของฉัน
                {unread > 0 && <span className="count-badge" aria-label={`${unread} รายการใหม่`}>{unread}</span>}
              </NavLink>
            )}
            {ready && !user && <NavLink to="/login" className="navl">เข้าสู่ระบบ</NavLink>}
            {ready && user && (
              <div className="acct">
                <button ref={menuBtn} type="button" className="acct-btn" aria-expanded={menuOpen} aria-controls="acct-menu"
                        aria-label={`บัญชีของ ${user.display_name}`} onClick={() => setMenuOpen((o) => !o)}>
                  <span className="ava" aria-hidden="true">{initialOf(user.display_name)}</span>
                  <span className="acct-name hide-sm" aria-hidden="true">{user.display_name}</span>
                  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="acct-chev">
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {menuOpen && (
                  <div ref={menu} id="acct-menu" className="acct-menu">
                    <p className="acct-who"><span className="caption">เข้าสู่ระบบอยู่ในชื่อ</span><strong>{user.display_name}</strong></p>
                    <Link to="/me/reports">ประกาศของฉัน</Link>
                    <button type="button" onClick={confirmLogout}>ออกจากระบบ</button>
                  </div>
                )}
              </div>
            )}
          </nav>
          <Link to="/reports/new" className="btn btn-brand cta" aria-label="แจ้งสัตว์หาย"><PlusIcon /><span className="cta-text">แจ้งสัตว์หาย</span></Link>
        </div>
      </header>
      <main id="main" className="wrap">
        <Outlet />
      </main>
      <footer className="site-foot">
        <div className="wrap">
          <span className="meta">La peace · ระบบไม่เก็บและไม่แสดงเบอร์โทร อีเมล หรือที่อยู่ของใคร</span>
          <nav aria-label="ลิงก์ท้ายหน้า" className="row">
            <Link to="/map" className="meta">แผนที่</Link>
            <Link to="/#faq" className="meta">คำถามที่พบบ่อย</Link>
            {ready && user && <span className="meta">เข้าสู่ระบบในชื่อ {user.display_name}</span>}
            {ready && user && <button type="button" className="btn btn-line" onClick={confirmLogout}>ออกจากระบบ</button>}
          </nav>
        </div>
      </footer>

      {askLogout && user && (
        <div className="scrim" role="presentation" onClick={() => setAskLogout(false)}>
          <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="logout-h" aria-describedby="logout-d"
               onClick={(e) => e.stopPropagation()}>
            <h2 id="logout-h">ออกจากระบบ?</h2>
            <p id="logout-d" className="meta">
              คุณเข้าสู่ระบบอยู่ในชื่อ {user.display_name} ถ้าออกแล้วต้องเข้าสู่ระบบใหม่ถึงจะดูประกาศของฉันและตอบข้อความได้
            </p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button ref={cancelBtn} type="button" className="btn btn-line" onClick={() => setAskLogout(false)}>ยกเลิก</button>
              <button type="button" className="btn btn-brand" disabled={busy} onClick={() => void signOut()}>
                {busy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast.node}
    </>
  )
}
