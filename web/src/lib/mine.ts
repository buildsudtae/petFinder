// API ไม่ส่ง owner_id และไม่มี GET /reports?mine — จำรหัสประกาศที่สร้างจากเบราว์เซอร์นี้ไว้เอง
// (เซิร์ฟเวอร์ยังเป็นผู้ตัดสินสิทธิ์จริง: PATCH โดยคนอื่นได้ 403 FORBIDDEN เสมอ)
const key = (userId: string) => `pettech.mine.${userId}`

export function myReportIds(userId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function rememberReport(userId: string, reportId: string): void {
  try {
    const ids = myReportIds(userId).filter((x) => x !== reportId)
    localStorage.setItem(key(userId), JSON.stringify([reportId, ...ids]))
  } catch {
    /* storage ถูกบล็อก: ใช้งานต่อได้ แค่หน้า "ประกาศของฉัน" จะว่าง */
  }
}
