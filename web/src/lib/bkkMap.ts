import L from 'leaflet'

import geo from './bkk-districts.json'

// ขอบเขตจริงของ 50 เขต กทม. จาก OpenGISData-Thailand (CC BY 4.0) ย่อจุดด้วย scripts/extract-bkk-districts.cjs
// แผนที่ยังเป็นระดับเขต (D9): ระบายทั้งเขต ไม่มีหมุดตำแหน่งจริง ไม่เก็บพิกัด ไม่ขอตำแหน่งผู้ใช้
type Geometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }
export interface DistrictFeature { type: 'Feature'; properties: { name: string; name_en: string }; geometry: Geometry }

export const DISTRICT_FEATURES = (geo as unknown as { features: DistrictFeature[] }).features

// ซูมได้สุดระดับ 14 = เห็นถนนและซอยใหญ่ แต่ไม่ถึงระดับบ้านทีละหลัง — nginx ก็ไม่ส่ง tile ที่ลึกกว่านี้
export const MIN_ZOOM = 10
export const MAX_ZOOM = 14
const BKK_BOUNDS = L.latLngBounds([13.45, 100.2], [14.05, 101.0])

const byName = new Map(DISTRICT_FEATURES.map((f) => [f.properties.name, f]))

/** ชื่อที่ผู้ใช้พิมพ์อาจมีคำว่า "เขต" นำหน้า — ตัดออกก่อนเทียบ */
export const districtKey = (district: string) => district.trim().replace(/^เขต\s*/, '')
export const districtFeature = (district: string) => byName.get(districtKey(district)) ?? null

/** จุดกลางถ่วงพื้นที่ของรูปที่ใหญ่สุดในเขต — ที่วางตัวเลขจำนวนประกาศ */
export function districtCenter(f: DistrictFeature): L.LatLng {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  let best: [number, number] = [0, 0], bestA = 0
  for (const p of polys) {
    const ring = p[0]
    let a = 0, cx = 0, cy = 0
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1], k = x1 * y2 - x2 * y1
      a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    }
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cy / (3 * a), cx / (3 * a)] }
  }
  return L.latLng(best[0], best[1])
}

export const districtBounds = (f: DistrictFeature) => L.geoJSON(f as never).getBounds()

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * แผนที่พื้นฐาน: ภาพถนนจาก OpenStreetMap ผ่าน /tiles ของเราเอง (nginx เก็บ cache ไว้)
 * เบราว์เซอร์ของผู้ใช้จึงไม่ได้ติดต่อ OSM โดยตรง
 */
export function createBaseMap(el: HTMLElement, opts: { onTileError?: () => void; wheel?: boolean } = {}) {
  const still = reducedMotion()
  const map = L.map(el, {
    minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, maxBounds: BKK_BOUNDS, maxBoundsViscosity: 0.8,
    zoomSnap: 0.5, zoomControl: false, attributionControl: false,
    scrollWheelZoom: opts.wheel ?? true, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still,
  })
  L.control.zoom({ position: 'topright', zoomInTitle: 'ซูมเข้า', zoomOutTitle: 'ซูมออก' }).addTo(map)
  L.control.attribution({ prefix: false }).addAttribution(
    '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ขอบเขตเขต <a href="https://github.com/chingchai/OpenGISData-Thailand">OpenGISData-Thailand</a> (CC BY 4.0)',
  ).addTo(map)
  L.tileLayer('/tiles/{z}/{x}/{y}.png', { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, bounds: BKK_BOUNDS })
    .on('tileerror', () => opts.onTileError?.())
    .addTo(map)
  map.setView(BKK_BOUNDS.getCenter(), MIN_ZOOM)
  return map
}

// บริเวณที่หายโดยประมาณ (ไม่บังคับ): ปัดเหลือทศนิยม 3 ตำแหน่ง ≈ 100 ม. ให้ตรงกับที่ server เก็บ
// แล้วแสดงเป็นวงกลมรัศมี 150 ม. ไม่ใช่จุดเดียว — ไม่ชี้บ้านหลังไหน (D9)
export const AREA_DECIMALS = 3
export const AREA_RADIUS_M = 150
export type Area = [number, number]   // [lat, lng] ที่ปัดแล้ว
export const roundArea = (lat: number, lng: number): Area => [+lat.toFixed(AREA_DECIMALS), +lng.toFixed(AREA_DECIMALS)]

/** จุดอยู่ในขอบเขตของเขตนี้หรือไม่ (ray casting บนทุกวงของทุกรูป) */
export function inDistrict(f: DistrictFeature, lat: number, lng: number): boolean {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  let inside = false
  for (const p of polys) {
    for (const ring of p) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j]
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
  }
  return inside
}
