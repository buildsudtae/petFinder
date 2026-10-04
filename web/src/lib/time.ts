// เวลาที่หายไป: ชั่วโมง:นาที (ตัวใหญ่) + ประโยคไทยสำหรับ screen reader

export interface Elapsed { hours: number; minutes: number; text: string }

export function elapsedBetween(fromIso: string, toMs: number): Elapsed {
  const total = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 60000))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const days = Math.floor(hours / 24)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours % 24 > 0 || days === 0) parts.push(`${hours % 24} ชั่วโมง`)
  parts.push(`${minutes} นาที`)
  return { hours, minutes, text: parts.join(' ') }
}

export function agoTh(iso: string, nowMs = Date.now()): string {
  const mins = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่ผ่านมา`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่ผ่านมา`
  return `${Math.floor(hours / 24)} วันที่ผ่านมา`
}

export function dateTimeTh(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

/** ค่าสำหรับ <input type="datetime-local"> ในเวลาท้องถิ่น */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
