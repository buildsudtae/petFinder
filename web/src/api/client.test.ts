import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, request } from './client'

// Traefik ตอบ 429 (rate limit) และ 413 (body cap) เป็น plain text ก่อนถึง API — ไม่มี {code, message_th}
const plain = (status: number, text: string) =>
  vi.fn().mockResolvedValue(new Response(text, { status, headers: { 'Content-Type': 'text/plain' } }))

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('429 จาก gateway บอกให้รอแล้วลองใหม่ ไม่ใช่ข้อผิดพลาดที่ไม่คาดคิด', async () => {
    vi.stubGlobal('fetch', plain(429, 'Too Many Requests'))
    const err = await request('/api/reports').catch((e: ApiError) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('RATE_LIMITED')
    expect((err as ApiError).messageTh).toContain('ลองใหม่')
  })

  it('413 จาก gateway ผูกกับช่องรูป และบอกขนาดที่รับได้', async () => {
    vi.stubGlobal('fetch', plain(413, 'Request Entity Too Large'))
    const err = (await request('/api/pets/x/photo', { method: 'PUT' }).catch((e) => e)) as ApiError
    expect(err.code).toBe('VALIDATION')
    expect(err.field).toBe('photo')
    expect(err.messageTh).toContain('5 MB')
  })

  it('error ที่มี JSON ตาม contract ยังใช้ข้อความจาก API เหมือนเดิม', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'REPORT_CLOSED', message_th: 'ประกาศนี้ปิดรับเบาะแส', field: null }), { status: 409 })))
    const err = (await request('/api/x').catch((e) => e)) as ApiError
    expect(err.code).toBe('REPORT_CLOSED')
    expect(err.messageTh).toBe('ประกาศนี้ปิดรับเบาะแส')
  })
})
