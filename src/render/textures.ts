// Procedural textures (deterministic) so preview and print match exactly.
import { mulberry32, type Pt } from '../geometry'

/** Faint hex grid over a region, fading in from `fadeFrom` to `fadeTo` (y units). */
export function hexGrid(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  opts: { x0: number; y0: number; x1: number; y1: number; r: number; color: string; fadeFrom: number; fadeTo: number; lineWidth: number },
): void {
  ctx.save()
  ctx.clip(clip)
  ctx.lineWidth = opts.lineWidth
  const r = opts.r
  const w = Math.sqrt(3) * r
  const rowH = 1.5 * r
  let row = 0
  for (let cy = opts.y0; cy <= opts.y1 + r; cy += rowH, row++) {
    const t = Math.min(1, Math.max(0, (cy - opts.fadeFrom) / (opts.fadeTo - opts.fadeFrom)))
    if (t <= 0) continue
    ctx.globalAlpha = t
    ctx.strokeStyle = opts.color
    const off = row % 2 ? w / 2 : 0
    for (let cx = opts.x0 - w + off; cx <= opts.x1 + w; cx += w) {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Little coloured specks (parchment mottling). */
export function speckles(
  ctx: CanvasRenderingContext2D,
  clip: Path2D,
  opts: { x0: number; y0: number; x1: number; y1: number; count: number; color: string; seed: number; maxR: number },
): void {
  ctx.save()
  ctx.clip(clip)
  const rnd = mulberry32(opts.seed)
  ctx.fillStyle = opts.color
  for (let i = 0; i < opts.count; i++) {
    const x = opts.x0 + rnd() * (opts.x1 - opts.x0)
    const y = opts.y0 + rnd() * (opts.y1 - opts.y0)
    const r = 0.3 + rnd() * opts.maxR
    ctx.globalAlpha = 0.15 + rnd() * 0.35
    ctx.beginPath()
    ctx.ellipse(x, y, r * (0.6 + rnd()), r, rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Distressed flecks along a polygon border band. */
export function distress(
  ctx: CanvasRenderingContext2D,
  outer: Pt[],
  inner: Pt[],
  opts: { seed: number; count: number; color: string; maxLen: number },
): void {
  const rnd = mulberry32(opts.seed)
  ctx.save()
  const band = new Path2D()
  outer.forEach(([x, y], i) => (i ? band.lineTo(x, y) : band.moveTo(x, y)))
  band.closePath()
  ;[...inner].reverse().forEach(([x, y], i) => (i ? band.lineTo(x, y) : band.moveTo(x, y)))
  band.closePath()
  ctx.clip(band, 'evenodd')
  ctx.fillStyle = opts.color
  const n = outer.length
  for (let i = 0; i < opts.count; i++) {
    // pick a random edge of the outer or inner outline and a point along it
    const useInner = rnd() < 0.45
    const poly = useInner ? inner : outer
    const e = Math.floor(rnd() * n)
    const [x1, y1] = poly[e]
    const [x2, y2] = poly[(e + 1) % n]
    const t = rnd()
    const px = x1 + (x2 - x1) * t
    const py = y1 + (y2 - y1) * t
    const len = 1 + rnd() * opts.maxLen
    const thick = 0.6 + rnd() * 2.2
    const ang = Math.atan2(y2 - y1, x2 - x1) + (rnd() - 0.5) * 0.6
    ctx.globalAlpha = 0.25 + rnd() * 0.55
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(ang)
    ctx.beginPath()
    ctx.ellipse(0, 0, len, thick, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/** Splatter of blood-red droplets (life icon). */
export function splat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, seed: number): void {
  const rnd = mulberry32(seed)
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // lumpy edge
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.3
    const rr = r * (0.35 + rnd() * 0.45)
    const d = r * (0.75 + rnd() * 0.35)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2)
    ctx.fill()
  }
  // droplets
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2
    const d = r * (1.3 + rnd() * 1.4)
    const rr = r * (0.06 + rnd() * 0.16)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rr, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
