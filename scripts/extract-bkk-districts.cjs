// usage: node extract-bkk.js <in.geojson> <out.json>
// keeps Bangkok (pro_code 10), simplifies rings (Douglas-Peucker), rounds to 4 decimals (~11 m)
const fs = require('fs')
const [inp, out] = process.argv.slice(2)
const src = JSON.parse(fs.readFileSync(inp, 'utf8'))
const TOL = 0.0006

function dp(pts, tol) {
  if (pts.length < 3) return pts
  const [a, b] = [pts[0], pts[pts.length - 1]]
  let max = 0, idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [x1, y1] = a, [x2, y2] = b
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1e-12
    const d = Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len
    if (d > max) { max = d; idx = i }
  }
  if (max <= tol) return [a, b]
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)]
}
const ring = (r) => { const s = dp(r, TOL).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]); return s.length >= 4 ? s : r.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) }
const geom = (g) => g.type === 'Polygon'
  ? { type: 'Polygon', coordinates: g.coordinates.map(ring) }
  : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(ring)) }

const feats = src.features.filter((f) => f.properties.pro_code === '10').map((f) => ({
  type: 'Feature',
  properties: { name: f.properties.amp_th.replace(/^เขต\s*/, ''), name_en: f.properties.amp_en },
  geometry: geom(f.geometry),
}))
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features: feats }))
console.log(feats.length, 'features;', fs.statSync(out).size, 'bytes;', feats.map((f) => f.properties.name).join(' '))
