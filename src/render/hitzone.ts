// Shared hit-zone silhouette drawing used by both card styles.
import type { CardDesign } from '../model'
import type { Silhouette } from '../cutout/silhouette'
import type { RenderEnv } from './env'
import { STAT_COLORS } from './palette'

export interface HzBox {
  cx: number
  cy: number
  w: number
  h: number
}

export interface SilhouetteSlot {
  x: number
  y: number
  w: number
  h: number
}

/** Where each silhouette goes inside the hit-zone box. */
export function hitZoneSlots(d: CardDesign, sils: (Silhouette | undefined)[], hz: HzBox): SilhouetteSlot[] {
  const n = sils.length
  const trim = Math.min(0.9, Math.max(0, d.hitZone.trimBottom))
  const ox = d.hitZone.x * (hz.h / 304)
  const oy = d.hitZone.y * (hz.h / 304)
  if (n <= 1) {
    const s = sils[0]
    const h = hz.h * d.hitZone.scale
    const aspect = s ? s.canvas.width / (s.canvas.height * (1 - trim)) : 0.5
    const w = aspect * h
    return [{ x: hz.cx + ox - w / 2, y: hz.cy + oy - h / 2, w, h }]
  }
  const cols = n === 2 ? 2 : n === 3 ? 3 : 2
  const rows = Math.ceil(n / cols)
  const cellW = (hz.w * 0.95) / cols
  const cellH = (hz.h * 0.82) / rows
  const slots: SilhouetteSlot[] = []
  for (let i = 0; i < n; i++) {
    const s = sils[i]
    const aspect = s ? s.canvas.width / (s.canvas.height * (1 - trim)) : 0.5
    let h = cellH * d.hitZone.scale
    let w = aspect * h
    if (w > cellW * 0.95) {
      w = cellW * 0.95
      h = w / aspect
    }
    const c = i % cols
    const r = Math.floor(i / cols)
    const cx = hz.cx + ox - ((cols - 1) * cellW) / 2 + c * cellW
    const cy = hz.cy + oy - ((rows - 1) * cellH) / 2 + r * cellH
    slots.push({ x: cx - w / 2, y: cy - h / 2, w, h })
  }
  return slots
}

/** Draw the red silhouettes, grey untargetable paint and green target point. */
export function drawSilhouettes(ctx: CanvasRenderingContext2D, d: CardDesign, env: RenderEnv, hz: HzBox): void {
  const sils = d.hitZone.items.map((it) => env.silhouette(it.imageId, d.hitZone.threshold))
  if (!sils.length || !sils.some(Boolean)) return
  const trim = Math.min(0.9, Math.max(0, d.hitZone.trimBottom))
  const slots = hitZoneSlots(d, sils, hz)
  slots.forEach((slot, i) => {
    const sil = sils[i]
    if (!sil) return
    const srcH = sil.canvas.height * (1 - trim)
    const sw = sil.canvas.width
    ctx.save()
    if (d.hitZone.flip) {
      ctx.translate(slot.x + slot.w / 2, 0)
      ctx.scale(-1, 1)
      ctx.translate(-(slot.x + slot.w / 2), 0)
    }
    ctx.drawImage(env.tinted(sil, STAT_COLORS.hitZoneRed), 0, 0, sw, srcH, slot.x, slot.y, slot.w, slot.h)
    if (i === 0 && d.hitZone.paintImageId) {
      const paint = env.img(d.hitZone.paintImageId)
      if (paint) {
        ctx.drawImage(env.maskedPaint(sil, paint, STAT_COLORS.hitZoneGray), 0, 0, sw, srcH, slot.x, slot.y, slot.w, slot.h)
      }
    }
    ctx.restore()
    if (i === 0 && d.hitZone.target) {
      const t = d.hitZone.target
      const tx = d.hitZone.flip ? slot.x + slot.w * (1 - t.x) : slot.x + slot.w * t.x
      const ty = slot.y + slot.h * t.y
      const r = t.r * (hz.h / 304)
      ctx.save()
      ctx.fillStyle = STAT_COLORS.target
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = r * 0.18
      ctx.beginPath()
      ctx.arc(tx, ty, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  })
}
