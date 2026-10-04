import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth'

export function Layout() {
  const { user, ready, logout } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await logout()
    navigate('/')
  }

  return (
    <>
      <a href="#main" className="skip-link">ข้ามไปยังเนื้อหา</a>
      <header className="site-header">
        <div className="wrap header-row">
          <Link to="/" className="brand" aria-label="ตามหา — หน้าแรก">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
              <ellipse cx="12" cy="16" rx="5.500" ry="4.500" fill="currentColor" />
              <circle cx="5" cy="10" r="2.200" fill="currentColor" />
              <circle cx="9.500" cy="5.500" r="2.200" fill="currentColor" />
              <circle cx="14.500" cy="5.500" r="2.200" fill="currentColor" />
              <circle cx="19" cy="10" r="2.200" fill="currentColor" />
            </svg>
            ตามหา
          </Link>
          <nav aria-label="เมนูหลัก" className="nav">
            <NavLink to="/" end>ประกาศทั้งหมด</NavLink>
            {ready && user && <NavLink to="/me/reports">ประกาศของฉัน</NavLink>}
            {ready && user && (
              <button type="button" className="btn btn-quiet" onClick={signOut}>
                ออกจากระบบ <span className="nav-name">({user.display_name})</span>
              </button>
            )}
            {ready && !user && <NavLink to="/login">เข้าสู่ระบบ</NavLink>}
          </nav>
        </div>
      </header>
      <main id="main" className="wrap">
        <Outlet />
      </main>
    </>
  )
}
