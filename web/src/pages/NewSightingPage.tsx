import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { ApiError } from '../api/client'
import { api, type Report } from '../api/endpoints'
import { ErrorBanner } from '../components/ErrorBanner'
import { PetPhoto } from '../components/PetPhoto'
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
    <section className="stack form-page">
      <Link to={`/reports/${id}`} className="back">← ยกเลิก</Link>
      <h1 style={{ fontSize: '1.875rem' }}>ส่งเบาะแส</h1>
      <ErrorBanner error={error} />
      {report && (
        <div className="card row" style={{ flexWrap: 'nowrap', padding: 12 }}>
          <PetPhoto url={report.photo_url} species={report.species} alt={`รูป${report.pet_name}`} className="pet-thumb" />
          <div style={{ minWidth: 0 }}>
            <p><strong>{report.pet_name}</strong> · {SPECIES_TH[report.species]}{report.color ? ` ${report.color}` : ''}</p>
            <p className="meta ellipsis">{report.marks ? `${report.marks} · ` : ''}หายที่{report.district}</p>
          </div>
          <span style={{ marginLeft: 'auto' }}><StatusPill status={report.status} /></span>
        </div>
      )}
      {report && (
        <NewSighting
          key={id}   // ฟอร์ม/Idempotency-Key ต้องเป็นของประกาศนี้เท่านั้น
          reportId={id}
          defaultDistrict={report.district}
          onSent={() => navigate(`/reports/${id}`, { state: { flash: 'ส่งเบาะแสแล้ว เจ้าของจะเห็นในรายการเบาะแส' } })}
          onAuthRequired={() => navigate('/login', { state: { from: `/reports/${id}/sighting` } })}
        />
      )}
    </section>
  )
}
