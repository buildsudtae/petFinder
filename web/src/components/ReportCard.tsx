import { Link } from 'react-router-dom'

import type { Report } from '../api/endpoints'
import { SPECIES_TH } from '../lib/labels'
import { dateTh, elapsedParts } from '../lib/time'
import { PinIcon } from './Icons'
import { PetPhoto } from './PetPhoto'
import { StatusPill } from './StatusPill'

/**
 * การ์ดประกาศของหน้าแรก: เขตที่หายตัวใหญ่ (สิ่งที่คนผ่านมาเทียบได้ทันที) ·
 * เวลาที่หายไปเป็นตัวเลขใหญ่มุมขวาล่าง · ประกาศที่พบแล้วมีตราประทับทับรูป
 */
export function ReportCard({ report: r, featured = false }: { report: Report; featured?: boolean }) {
  const found = r.status === 'RESOLVED'
  const parts = found ? null : elapsedParts(r.last_seen_at)
  const desc = [SPECIES_TH[r.species], r.color, r.marks].filter(Boolean).join(' · ')
  return (
    <li className={featured ? 'feat-li' : undefined}>
      <Link to={`/reports/${r.id}`} className={`rcard${featured ? ' feat' : ''}${found ? ' found' : ''}`}>
        <div className="photo-box on-photo">
          <PetPhoto url={r.photo_url} species={r.species} alt={`${r.pet_name} ${desc}`} />
          <StatusPill status={r.status} count={r.status === 'HAS_LEAD' ? r.sighting_count : undefined} />
          {found && <span className="stamp" aria-hidden="true">พบแล้ว</span>}
        </div>
        <div className="rbody">
          <div style={{ minWidth: 0 }}>
            <span className="place-label"><PinIcon />{found ? 'หายที่เขต' : 'หายแถวเขต'}</span>
            <p className="place">{r.district}</p>
            {r.area_note && <p className="meta ellipsis">{r.area_note}</p>}
          </div>
          <div className="rfoot">
            <div>
              <h3>{r.pet_name}</h3>
              <p className="meta">{desc}</p>
            </div>
            <div className="time">
              <span className="caption">{found ? 'พบแล้วเมื่อ' : 'หายไปแล้ว'}</span>
              <span className="time-v">
                {parts
                  ? parts.map(([n, u]) => <span key={u}><span className="num">{n}</span> <span className="unit">{u}</span></span>)
                  : <span className="num" style={{ fontSize: '1.125rem' }}>{r.resolved_at ? dateTh(r.resolved_at) : '—'}</span>}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}
