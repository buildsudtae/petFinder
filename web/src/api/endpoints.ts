import { request } from './client'

export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other'
export type Status = 'SEARCHING' | 'HAS_LEAD' | 'RESOLVED'

export interface User { id: string; display_name: string }
export interface Pet { id: string; name: string; species: Species; color: string | null; marks: string | null }
export interface Report {
  id: string
  status: Status
  pet_name: string
  species: Species
  color: string | null
  marks: string | null
  last_seen_at: string
  district: string
  area_note: string | null
  description: string | null
  sighting_count: number
  created_at: string
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

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  me: () => request<User>('/api/me'),
  register: (b: { email: string; password: string; display_name: string }) =>
    request<User>('/api/auth/register', jsonInit('POST', b)),
  login: (b: { email: string; password: string }) => request<User>('/api/auth/login', jsonInit('POST', b)),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  pets: () => request<{ items: Pet[] }>('/api/pets').then((r) => r.items),
  createPet: (b: { name: string; species: Species; color: string | null; marks: string | null }) =>
    request<Pet>('/api/pets', jsonInit('POST', b)),

  createReport: (b: {
    pet_id: string; last_seen_at: string; district: string; area_note: string | null; description: string | null
  }) => request<Report>('/api/reports', jsonInit('POST', b)),
  reports: (q: { species?: string; district?: string; status?: string; limit?: number }) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v))
    return request<{ items: Report[] }>(`/api/reports?${p}`).then((r) => r.items)
  },
  report: (id: string) => request<Report>(`/api/reports/${id}`),
  changeStatus: (id: string, to: Status, reason?: string) =>
    request<Report>(`/api/reports/${id}/status`, jsonInit('PATCH', { to, reason: reason || null })),
  events: (id: string) => request<{ items: ReportEvent[] }>(`/api/reports/${id}/events`).then((r) => r.items),
  sightings: (id: string) => request<{ items: Sighting[] }>(`/api/reports/${id}/sightings`).then((r) => r.items),

  messages: (id: string) => request<{ items: Message[] }>(`/api/reports/${id}/messages`).then((r) => r.items),
  sendMessage: (id: string, body: string) => request<Message>(`/api/reports/${id}/messages`, jsonInit('POST', { body })),
}
