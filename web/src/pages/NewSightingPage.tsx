import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { StatusPill } from '../components/StatusPill'
import { SPECIES_TH } from '../lib/labels'
import { NewSighting } from './NewSighting'

/** หน้า /reports/:id/sighting — แถบย่อของประกาศให้เทียบกับตัวที่เห็น + ฟอร์มส่งเบาะแส */
export function NewSightingPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => { api.report(id).then(setReport, setError) }, [id])

  return (
    <section className="stack">
      <Link to={`/reports/${id}`} className="back">← ยกเลิก</Link>
      <h1>ส่งเบาะแส{report ? `: ${report.pet_name}` : ''}</h1>
      <ErrorBanner error={error} />
      {report && (
        <div className="card brief-strip">
          <p><strong>{SPECIES_TH[report.species]}{report.color ? ` ${report.color}` : ''}</strong>{report.marks ? ` · ${report.marks}` : ''}</p>
          <p className="meta">{report.district}{report.area_note ? ` — ${report.area_note}` : ''}</p>
          <StatusPill status={report.status} />
        </div>
      )}
      <NewSighting
        key={id}   // ฟอร์ม/Idempotency-Key ต้องเป็นของประกาศนี้เท่านั้น
        reportId={id}
        onSent={() => navigate(`/reports/${id}`)}
        onAuthRequired={() => navigate('/login', { state: { from: `/reports/${id}/sighting` } })}
      />
    </section>
  )
}
