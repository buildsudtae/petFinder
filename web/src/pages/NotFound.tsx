import { Link } from 'react-router-dom'

import { SearchIcon } from '../components/Icons'

export function NotFound() {
  return (
    <section className="empty" style={{ background: 'transparent', padding: '96px 16px' }}>
      <SearchIcon size={40} />
      <span className="caption mono">404</span>
      <h1>ไม่พบหน้านี้</h1>
      <p className="meta">ลิงก์อาจไม่ครบหรือพิมพ์ผิด กลับไปดูรายการประกาศ แล้วกรองตามเขตหรือชนิดสัตว์แทน</p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn btn-brand">ไปหน้าแรก</Link>
        <Link to="/me/reports" className="btn btn-line">ประกาศของฉัน</Link>
      </div>
    </section>
  )
}
