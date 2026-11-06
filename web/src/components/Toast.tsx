import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * toast ใช้เสริมเท่านั้น (D9) — ทุกครั้งที่เรียกต้องมี state บนหน้าที่ค้างอยู่ยืนยันผลเดียวกันด้วย
 * เช่น ปิดประกาศแล้วการ์ดเปลี่ยนเป็น "พบแล้ว" ไม่ใช่พึ่ง toast ที่หายไปเอง
 */
export function useToast(ms = 4000) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(null), ms)
  }, [ms])
  useEffect(() => () => clearTimeout(timer.current), [])
  const node = message ? <div className="toast" role="status"><span>{message}</span></div> : null
  return { show, node }
}
