import type { Species } from '../api/endpoints'
import { SPECIES_TH } from '../lib/labels'

/** รูปสัตว์ หรือพื้นที่สำรองที่บอกชนิดสัตว์เมื่อเจ้าของยังไม่ได้ใส่รูป — ขนาดคงที่ กัน layout shift */
export function PetPhoto({ url, alt, species, className = 'photo' }: {
  url?: string | null; alt: string; species: Species; className?: string
}) {
  if (url) return <img src={url} alt={alt} className={className} loading="lazy" />
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
