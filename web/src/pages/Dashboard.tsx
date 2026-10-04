import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { useAuth } from '../auth'
import { ErrorBanner } from '../components/ErrorBanner'
import { ReportCard } from '../components/ReportCard'
import { myReportIds } from '../lib/mine'

/**
 * ประกาศของฉัน — API ยังไม่มี endpoint "ของฉัน" และ ReportOut ไม่มี owner_id
 * จึงแสดงประกาศที่สร้างจากเบราว์เซอร์นี้ (จำรหัสไว้ใน localStorage ต่อผู้ใช้)
 */
export function Dashboard() {
  const { user } = useAuth()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setError(null)
    setReports(null)
    const results = await Promise.allSettled(myReportIds(user.id).map((id) => api.report(id)))
    setReports(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
    const failed = results.find((r) => r.status === 'rejected' && (r.reason as ApiError).code !== 'NOT_FOUND')
    if (failed && failed.status === 'rejected') setError(failed.reason as ApiError)
  }, [user])

  useEffect(() => { void load() }, [load])

  return (
    <section className="stack">
      <div className="page-head">
        <h1>ประกาศของฉัน</h1>
        <Link to="/reports/new" className="btn btn-primary">แจ้งสัตว์หาย</Link>
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {reports === null && <p className="loading" role="status">กำลังโหลด…</p>}
      {reports?.length === 0 && (
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
