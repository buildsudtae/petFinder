import { useEffect, useState } from 'react'

import { elapsedBetween } from '../lib/time'

/**
 * องค์ประกอบเด่นของแอป: ชั่วโมง:นาทีที่สัตว์หายไป ตัวใหญ่ที่สุดของการ์ด
 * ส่ง `until` (ISO) เพื่อหยุดเวลา (เช่นประกาศที่พบแล้ว) ไม่ส่ง = นับต่อ ทุก 30 วินาที
 */
export function ElapsedClock({ since, until }: { since: string; until?: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [until])

  const e = elapsedBetween(since, until ? new Date(until).getTime() : now)
  return (
    <div className="clock" role="group" aria-label={`${until ? 'ใช้เวลา' : 'หายไป'} ${e.text}`}>
      <span className="clock-num" aria-hidden="true">{e.hours}:{String(e.minutes).padStart(2, '0')}</span>
      <span className="clock-unit" aria-hidden="true">
        ชั่วโมง : นาที<br />{until ? 'ที่ใช้ตามหา' : 'ที่หายไป'}
      </span>
    </div>
  )
}
