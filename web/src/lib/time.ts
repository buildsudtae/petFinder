// เวลาที่หายไป: ตัวเลขใหญ่ + ประโยคไทยสำหรับ screen reader

export interface Elapsed { days: number; hours: number; minutes: number; seconds: number; text: string }

export function elapsedBetween(fromIso: string, toMs: number): Elapsed {
  const totalSec = Math.max(0, Math.floor((toMs - new Date(fromIso).getTime()) / 1000))
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} วัน`)
  if (hours > 0 || days === 0) parts.push(`${hours} ชั่วโมง`)
  parts.push(`${minutes} นาที`)
  return { days, hours, minutes, seconds, text: parts.join(' ') }
}

/** สองหน่วยที่ใหญ่ที่สุด สำหรับการ์ด: [["3","ชม."],["20","น."]] */
export function elapsedParts(fromIso: string, toMs = Date.now()): [string, string][] {
  const e = elapsedBetween(fromIso, toMs)
  if (e.days > 0) return [[String(e.days), 'วัน'], [String(e.hours), 'ชม.']]
  if (e.hours > 0) return [[String(e.hours), 'ชม.'], [String(e.minutes), 'น.']]
  return [[String(e.minutes), 'นาที']]
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

export function dateTh(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export function timeTh(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

/** ค่าสำหรับ <input type="datetime-local"> ในเวลาท้องถิ่น */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
