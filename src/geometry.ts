// Card geometry in "card units". The Age of Annihilation frame is drawn in a
// 1000 x 940 unit space traced from the die-cut outline of a real card.

export type Pt = [number, number]

export const CARD_W = 1000
export const CARD_H = 940

/** Physical width of a real army card in inches (height follows the aspect). */
export const PHYSICAL_W_IN = 4.85

/** Die-cut hex-flower outline, clockwise from the top-left peak. */
export const OUTLINE: Pt[] = [
  [320, 0],
  [500, 103],
  [680, 0],
  [819, 80],
  [819, 285],
  [1000, 390],
  [1000, 550],
  [819, 655],
  [819, 860],
  [680, 940],
  [500, 837],
  [320, 940],
  [181, 860],
  [181, 655],
  [0, 550],
  [0, 390],
  [181, 285],
  [181, 80],
]

export function polygonPath(poly: Pt[], path = new Path2D()): Path2D {
  poly.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)))
  path.closePath()
  return path
}

function signedArea(poly: Pt[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/**
 * Offset a simple polygon inward by `d` units (outward when negative).
 * Each edge is shifted along its inward normal and adjacent shifted edges are
 * intersected. Fine for the card outline where edges are long relative to d.
 */
export function insetPolygon(poly: Pt[], d: number): Pt[] {
  const n = poly.length
  const orient = signedArea(poly) > 0 ? 1 : -1 // canvas y-down: positive area = clockwise on screen
  const lines: { p: Pt; dir: Pt }[] = []
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % n]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy) || 1
    // inward normal
    const nx = (-dy / len) * orient
    const ny = (dx / len) * orient
    lines.push({ p: [x1 + nx * d, y1 + ny * d], dir: [dx / len, dy / len] })
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n]
    const b = lines[i]
    const cross = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0]
    if (Math.abs(cross) < 1e-9) {
      out.push(b.p)
      continue
    }
    const t = ((b.p[0] - a.p[0]) * b.dir[1] - (b.p[1] - a.p[1]) * b.dir[0]) / cross
    out.push([a.p[0] + a.dir[0] * t, a.p[1] + a.dir[1] * t])
  }
  return out
}

export function hexagonPath(cx: number, cy: number, r: number, pointyTop = true, path = new Path2D()): Path2D {
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i + (pointyTop ? -Math.PI / 2 : 0)
    const x = cx + r * Math.cos(ang)
    const y = cy + r * Math.sin(ang)
    i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)
  }
  path.closePath()
  return path
}

export function rectPath(x: number, y: number, w: number, h: number, path = new Path2D()): Path2D {
  path.rect(x, y, w, h)
  return path
}

export function bboxOf(poly: Pt[]): { x: number; y: number; w: number; h: number } {
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity
  for (const [x, y] of poly) {
    if (x < minx) minx = x
    if (y < miny) miny = y
    if (x > maxx) maxx = x
    if (y > maxy) maxy = y
  }
  return { x: minx, y: miny, w: maxx - minx, h: maxy - miny }
}

/** Deterministic pseudo random generator so textures match between preview and export. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
