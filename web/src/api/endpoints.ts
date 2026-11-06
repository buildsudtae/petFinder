import { request } from './client'

export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
export type Status = 'SEARCHING' | 'HAS_LEAD' | 'RESOLVED'

export interface User { id: string; display_name: string }
export interface Pet {
  id: string; name: string; species: Species; color: string | null; marks: string | null; photo_url?: string | null
}
export interface Report {
  id: string
  status: Status
  pet_name: string
  species: Species
  color: string | null
  marks: string | null
  photo_url?: string | null
  last_seen_at: string
  district: string
  area_note: string | null
  description: string | null
  sighting_count: number
  is_owner: boolean
  created_at: string
  resolved_at?: string | null
}
export interface Sighting {
  id: string
  finder_display_name: string
  photo_url: string | null
  thumb_url: string | null
  seen_at: string
  district: string
  area_note: string | null
  note: string | null
  created_at: string
}
export interface ReportEvent { from_status: Status | null; to_status: Status; reason: string | null; created_at: string }
export interface Message { id: number; sender_display_name: string; body: string; created_at: string }
export interface Thread {
  id: string
  finder_display_name: string
  sighting_district: string | null
  sighting_area_note: string | null
  last_message: string | null
  last_message_at: string | null
  last_message_mine: boolean
  unread_count: number
}
export interface Notification {
  id: number; topic: string; report_id: string | null; status_to: string | null; created_at: string; read: boolean
}

export interface ReportQuery {
  species?: string; district?: string; status?: string; limit?: number; mine?: boolean
  include_resolved?: boolean; cursor?: string | null
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const query = (q: object) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v))
  return p
}

export const api = {
  me: () => request<User>('/api/me'),
  register: (b: { email: string; password: string; display_name: string }) =>
    request<User>('/api/auth/register', jsonInit('POST', b)),
  login: (b: { email: string; password: string }) => request<User>('/api/auth/login', jsonInit('POST', b)),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  pets: () => request<{ items: Pet[] }>('/api/pets').then((r) => r.items),
  createPet: (b: { name: string; species: Species; color: string | null; marks: string | null }) =>
    request<Pet>('/api/pets', jsonInit('POST', b)),
  setPetPhoto: (petId: string, photo: File) => {
    const form = new FormData()
    form.set('photo', photo)
    return request<Pet>(`/api/pets/${petId}/photo`, { method: 'PUT', body: form })
  },

  createReport: (b: {
    pet_id: string; last_seen_at: string; district: string; area_note: string | null; description: string | null
  }) => request<Report>('/api/reports', jsonInit('POST', b)),
  /** หน้าเดียว + cursor ของหน้าถัดไป (null = หมดแล้ว) */
  reportPage: (q: ReportQuery) =>
    request<{ items: Report[]; next_cursor?: string | null }>(`/api/reports?${query(q)}`)
      .then((r) => ({ items: r.items, next: r.next_cursor ?? null })),
  reports: (q: ReportQuery) => request<{ items: Report[] }>(`/api/reports?${query(q)}`).then((r) => r.items),
  report: (id: string) => request<Report>(`/api/reports/${id}`),
  changeStatus: (id: string, to: Status, reason?: string) =>
    request<Report>(`/api/reports/${id}/status`, jsonInit('PATCH', { to, reason: reason || null })),
  events: (id: string) => request<{ items: ReportEvent[] }>(`/api/reports/${id}/events`).then((r) => r.items),
  sightings: (id: string) => request<{ items: Sighting[] }>(`/api/reports/${id}/sightings`).then((r) => r.items),

  threads: (id: string) => request<{ items: Thread[] }>(`/api/reports/${id}/threads`).then((r) => r.items ?? []),
  markThreadRead: (id: string, threadId: string) =>
    request<void>(`/api/reports/${id}/threads/${threadId}/read`, { method: 'POST' }),
  messages: (id: string, threadId?: string) =>
    request<{ items: Message[] }>(`/api/reports/${id}/messages${threadId ? `?thread_id=${threadId}` : ''}`)
      .then((r) => r.items),
  sendMessage: (id: string, body: string, threadId?: string) =>
    request<Message>(`/api/reports/${id}/messages`, jsonInit('POST', threadId ? { body, thread_id: threadId } : { body })),

  notifications: () => request<{ items: Notification[]; unread_count: number }>('/api/notifications'),
  markNotificationsRead: (reportId?: string) =>
    request<void>('/api/notifications/read', jsonInit('POST', reportId ? { report_id: reportId } : {})),
}
