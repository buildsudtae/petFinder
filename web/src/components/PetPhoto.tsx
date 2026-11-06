import type { Species } from '../api/endpoints'
import { SPECIES_TH } from '../lib/labels'

// ภาพประกอบตามชนิดสัตว์ (ไฟล์ใน web/public) — ใช้แทนเมื่อเจ้าของยังไม่ได้ใส่รูป และบอกชัดว่าไม่ใช่รูปจริง
const ILLUSTRATIONS: Partial<Record<Species, string[]>> = {
  dog: ['/illustrations/dog-brown.svg', '/illustrations/dog-bw.svg'],
  cat: ['/illustrations/cat-orange.svg', '/illustrations/cat-gray.svg'],
}

function pick(list: string[], seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return list[Math.abs(h) % list.length]
}

/** รูปสัตว์ หรือภาพประกอบ/พื้นที่สำรองเมื่อเจ้าของยังไม่ได้ใส่รูป — ขนาดคงที่ กัน layout shift */
export function PetPhoto({ url, alt, species, className = 'photo' }: {
  url?: string | null; alt: string; species: Species; className?: string
}) {
  if (url) return <img src={url} alt={alt} className={className} loading="lazy" />
  const illus = ILLUSTRATIONS[species]
  if (illus) {
    const thumb = className.includes('pet-thumb')
    return (
      <div className={`${className} photo-illus`}>
        <img src={pick(illus, alt)} alt={`ภาพประกอบ${SPECIES_TH[species]} (เจ้าของยังไม่ได้ใส่รูป)`} loading="lazy" />
        {!thumb && <span className="illus-tag" aria-hidden="true">ภาพประกอบ · เจ้าของยังไม่ได้ใส่รูป</span>}
      </div>
    )
  }
  return (
    <div className={`${className} photo-ph`} role="img" aria-label={`${alt} (ยังไม่มีรูป)`}>
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
        <ellipse cx="12" cy="16" rx="5.5" ry="4.5" />
        <circle cx="5" cy="10" r="2.2" />
        <circle cx="9.5" cy="5.5" r="2.2" />
        <circle cx="14.5" cy="5.5" r="2.2" />
        <circle cx="19" cy="10" r="2.2" />
      </svg>
      <span aria-hidden="true">{SPECIES_TH[species]}</span>
    </div>
  )
}
