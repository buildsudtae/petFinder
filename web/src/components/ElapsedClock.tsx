import { useEffect, useState } from 'react'

import { elapsedBetween } from '../lib/time'

/**
 * นาฬิกาเวลาที่หายไปของหน้ารายละเอียด: นับทุกวินาที
 * ส่ง `until` (ISO) เพื่อหยุดเวลา เช่นประกาศที่พบแล้ว — นาฬิกาต้องไม่เดินต่อหลังปิดประกาศ
 */
export function ElapsedClock({ since, until }: { since: string; until?: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [until])

  const e = elapsedBetween(since, until ? new Date(until).getTime() : now)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    <div role="group" aria-label={`${until ? 'ใช้เวลาตามหา' : 'หายไปแล้ว'} ${e.text}`}>
      <p className={`clock-big${until ? ' stopped' : ''}`} aria-hidden="true">
        {e.days > 0 && <>{e.days} <span style={{ fontSize: '1.25rem' }}>วัน</span> </>}
        {e.hours}:{p(e.minutes)}:{p(e.seconds)}
      </p>
      <p className="meta" aria-hidden="true">{until ? 'ใช้เวลาตามหาจนพบ' : 'นับจากเห็นครั้งสุดท้าย'}</p>
    </div>
  )
}
