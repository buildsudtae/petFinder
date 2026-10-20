import { useEffect, useState } from 'react'

import type { ApiError } from '../api/client'

/**
 * 422 + field ที่ตรงกับช่องบนฟอร์ม -> ข้อความใต้ช่องนั้นและย้าย focus ไปที่ช่อง
 * error อื่น (ไม่มี field / field ไม่ตรงช่อง) -> แถบ ErrorBanner ด้านบน
 */
export function useFormError(fields: string[]) {
  const [error, setError] = useState<ApiError | null>(null)
  const onField = !!error?.field && fields.includes(error.field)

  useEffect(() => {
    if (error && onField) document.getElementById(error.field!)?.focus()
  }, [error, onField])

  return {
    error,
    setError,
    bannerError: onField ? null : error,
    fieldMessage: (name: string) => (onField && error!.field === name ? error!.messageTh : null),
  }
}
