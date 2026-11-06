// วางชื่อเขตข้างหมุดแบบไม่ให้ทับกัน (greedy) — หน่วยเป็นพิกเซลของกล่องแผนที่ที่แสดงอยู่จริง
// หมุดที่มีประกาศมากกว่าได้ที่ก่อน ถ้าไม่มีที่ว่างเลยก็ไม่แสดงชื่อ (ชื่อยังอยู่ใน aria-label ของหมุด)

export interface LabelInput { key: string; x: number; y: number; text: string; weight: number }
export interface LabelBox { left: number; top: number; width: number; height: number }

const PIN_R = 18
const GAP = 4
const LABEL_H = 16
const CHAR_W = 7   // ตัวอักษรไทย 12px โดยประมาณ ต่อหนึ่งตัวที่กินที่ (สระบน/ล่างและวรรณยุกต์ไม่นับ)
const COMBINING = /[ัิ-ฺ็-๎]/g

export function labelWidth(text: string) {
  return text.replace(COMBINING, '').length * CHAR_W
}

function overlaps(a: LabelBox, b: LabelBox) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

export function placeLabels(pins: LabelInput[], bounds: { width: number; height: number }): Map<string, LabelBox> {
  const taken: LabelBox[] = pins.map((p) => ({ left: p.x - PIN_R, top: p.y - PIN_R, width: PIN_R * 2, height: PIN_R * 2 }))
  const placed = new Map<string, LabelBox>()
  const order = [...pins].sort((a, b) => b.weight - a.weight || a.y - b.y)
  for (const p of order) {
    const w = labelWidth(p.text)
    const candidates: LabelBox[] = [
      { left: p.x - w / 2, top: p.y + PIN_R + GAP, width: w, height: LABEL_H },              // ใต้หมุด
      { left: p.x + PIN_R + GAP, top: p.y - LABEL_H / 2, width: w, height: LABEL_H },        // ขวา
      { left: p.x - PIN_R - GAP - w, top: p.y - LABEL_H / 2, width: w, height: LABEL_H },    // ซ้าย
      { left: p.x - w / 2, top: p.y - PIN_R - GAP - LABEL_H, width: w, height: LABEL_H },    // บน
    ]
    const fit = candidates.find((c) =>
      c.left >= 0 && c.top >= 0 && c.left + c.width <= bounds.width && c.top + c.height <= bounds.height &&
      !taken.some((t) => overlaps(c, t)))
    if (fit) { taken.push(fit); placed.set(p.key, fit) }
  }
  return placed
}
