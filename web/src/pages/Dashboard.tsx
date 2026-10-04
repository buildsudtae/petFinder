import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { ReportCard } from '../components/ReportCard'

/** ประกาศของฉัน — GET /api/reports?mine=true (ทุกสถานะ) ตามบัญชีที่ล็อกอิน ไม่ขึ้นกับเบราว์เซอร์/อุปกรณ์ */
export function Dashboard() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setReports(null)
    try {
      setReports(await api.reports({ mine: true, limit: 100 }))
    } catch (e) {
      setError(e as ApiError)
      setReports([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <section className="stack">
      <div className="page-head">
        <h1>ประกาศของฉัน</h1>
        <Link to="/reports/new" className="btn btn-primary">แจ้งสัตว์หาย</Link>
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {reports === null && <p className="loading" role="status">กำลังโหลด…</p>}
      {reports?.length === 0 && !error && (
        <div className="card empty">
          <p>คุณยังไม่มีประกาศ — ถ้าสัตว์เลี้ยงหาย แจ้งได้ที่นี่</p>
          <Link to="/reports/new" className="btn btn-primary">แจ้งสัตว์หาย</Link>
        </div>
      )}
      {reports && reports.length > 0 && (
        <ul className="report-list">{reports.map((r) => <ReportCard key={r.id} report={r} />)}</ul>
      )}
    </section>
  )
}
