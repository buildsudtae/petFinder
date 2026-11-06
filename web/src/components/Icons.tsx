// ไอคอนเส้นเดียวกันทั้งแอป — ตกแต่งเท่านั้น (aria-hidden) ความหมายอยู่ในข้อความข้างๆ เสมอ
type P = { size?: number }
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false,
})

export function Logo({ size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#FF5A1F" />
      <circle cx="10" cy="12" r="2.6" fill="#111111" />
      <circle cx="16" cy="9.5" r="2.6" fill="#111111" />
      <circle cx="22" cy="12" r="2.6" fill="#111111" />
      <path d="M16 15c-4 0-7 4.2-7 6.6 0 1.8 1.6 2.4 3.4 2.4 1.6 0 2.2-.8 3.6-.8s2 .8 3.6.8c1.8 0 3.4-.6 3.4-2.4 0-2.4-3-6.6-7-6.6z" fill="#111111" />
    </svg>
  )
}

export const PinIcon = ({ size = 14 }: P) => (
  <svg {...base(size)}><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
)
export const PlusIcon = ({ size = 18 }: P) => <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
export const MapIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
)
export const SearchIcon = ({ size = 18 }: P) => <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
export const CheckIcon = ({ size = 18 }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>
export const OfflineIcon = ({ size = 24 }: P) => (
  <svg {...base(size)}><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01M3 3l18 18" /></svg>
)
