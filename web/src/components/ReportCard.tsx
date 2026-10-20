import { Link } from 'react-router-dom'

import type { Report } from '../api/endpoints'
import { SPECIES_TH } from '../lib/labels'
import { dateTimeTh } from '../lib/time'
import { ElapsedClock } from './ElapsedClock'
import { StatusPill } from './StatusPill'

/** ประกาศหนึ่งแถว: เวลาที่หายไปใหญ่สุด, สถานะ = icon + ข้อความ + รูปกรอบ, ประกาศที่พบแล้วมีตราประทับทับ */
export function ReportCard({ report: r }: { report: Report }) {
  const resolved = r.status === 'RESOLVED'
  return (
    <li className={`card report-card status-${r.status}`}>
      <Link to={`/reports/${r.id}`} className="report-link">
        <div className="tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="44" height="44" focusable="false">
            <ellipse cx="12" cy="16" rx="5.500" ry="4.500" fill="currentColor" />
            <circle cx="5" cy="10" r="2.200" fill="currentColor" />
            <circle cx="9.500" cy="5.500" r="2.200" fill="currentColor" />
            <circle cx="14.500" cy="5.500" r="2.200" fill="currentColor" />
            <circle cx="19" cy="10" r="2.200" fill="currentColor" />
          </svg>
          <span>{SPECIES_TH[r.species]}</span>
          {resolved && <span className="stamp">พบแล้ว</span>}
        </div>
        <div className="report-body">
          {resolved
            ? <p className="meta">เห็นครั้งสุดท้าย {dateTimeTh(r.last_seen_at)}</p>
            : <ElapsedClock since={r.last_seen_at} />}
          <h3 className="report-name">{r.pet_name}</h3>
          <p className="meta">{SPECIES_TH[r.species]}{r.color ? ` · ${r.color}` : ''}</p>
          <p className="meta">{r.district}{r.area_note ? ` — ${r.area_note}` : ''}</p>
          <div className="row">
            <StatusPill status={r.status} />
            {r.sighting_count > 0 && <span className="count">{r.sighting_count} เบาะแส</span>}
          </div>
        </div>
      </Link>
    </li>
  )
}
