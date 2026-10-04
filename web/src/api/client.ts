export class ApiError extends Error {
  constructor(readonly code: string, readonly messageTh: string, readonly field: string | null) {
    super(messageTh)
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    // เครือข่ายล่ม/ออฟไลน์: fetch reject เป็น TypeError ไม่ใช่ ApiError — ต้องมีข้อความไทยเสมอ
    throw new ApiError('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', null)
  }
  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      body?.code ?? 'VALIDATION',
      body?.message_th ?? 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่',
      body?.field ?? null,
    )
  }
  return body as T
}
