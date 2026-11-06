import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { api } from '../api/endpoints'
import { useAuth } from '../auth'
import { Logo, PlusIcon } from './Icons'

export function Layout() {
  const { user, ready, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  // แจ้งเตือนมาจาก worker หลังเหตุการณ์ไม่กี่วินาที (C5) — อ่านใหม่ทุกครั้งที่เปลี่ยนหน้า พอสำหรับ badge
  useEffect(() => {
    if (!user) { setUnread(0); return }
    api.notifications().then((n) => setUnread(n.unread_count), () => setUnread(0))
  }, [user, location.pathname])

  async function signOut() {
    await logout()
    navigate('/')
  }

  return (
    <>
      <a href="#main" className="skip-link">ข้ามไปยังเนื้อหา</a>
      <header className="top">
        <div className="wrap top-in">
          <Link to="/" className="brand" aria-label="ตามหา หน้าแรก"><Logo />ตามหา</Link>
          <nav aria-label="เมนูหลัก" className="navs">
            <NavLink to="/" end className="navl hide-sm">ประกาศ</NavLink>
            <NavLink to="/map" className="navl hide-sm">แผนที่</NavLink>
            {ready && user && (
              <NavLink to="/me/reports" className="navl">
                ประกาศของฉัน
                {unread > 0 && <span className="count-badge" aria-label={`${unread} รายการใหม่`}>{unread}</span>}
              </NavLink>
            )}
            {ready && user && (
              <button type="button" className="navl navl-btn hide-sm" onClick={signOut}>ออกจากระบบ</button>
            )}
            {ready && !user && <NavLink to="/login" className="navl">เข้าสู่ระบบ</NavLink>}
          </nav>
          <Link to="/reports/new" className="btn btn-brand cta" aria-label="แจ้งสัตว์หาย"><PlusIcon /><span className="cta-text">แจ้งสัตว์หาย</span></Link>
        </div>
      </header>
      <main id="main" className="wrap">
        <Outlet />
      </main>
      <footer className="site-foot">
        <div className="wrap">
          <span className="meta">ตามหา · ระบบไม่เก็บและไม่แสดงเบอร์โทร อีเมล หรือที่อยู่ของใคร</span>
          <nav aria-label="ลิงก์ท้ายหน้า" className="row">
            <Link to="/map" className="meta">แผนที่</Link>
            <Link to="/#faq" className="meta">คำถามที่พบบ่อย</Link>
            {ready && user && <span className="meta">เข้าสู่ระบบในชื่อ {user.display_name}</span>}
            {ready && user && <button type="button" className="btn btn-line" onClick={signOut}>ออกจากระบบ</button>}
          </nav>
        </div>
      </footer>
    </>
  )
}
