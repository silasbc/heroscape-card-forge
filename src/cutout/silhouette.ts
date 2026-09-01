// Builds and caches hit-zone silhouettes from cutout images.
import { getSync } from '../images'

export interface Silhouette {
  /** cropped silhouette, opaque where the figure is, transparent elsewhere */
  canvas: HTMLCanvasElement
  /** alpha-only mask canvas (white where figure) used for clipping the paint layer */
  mask: HTMLCanvasElement
  /** crop offset within the source image, in source pixels */
  offsetX: number
  offsetY: number
  srcW: number
  srcH: number
}

const cache = new Map<string, Silhouette>()

export function getSilhouetteSync(imageId: string | undefined, threshold: number): Silhouette | undefined {
  if (!imageId) return undefined
  const key = imageId + ':' + threshold
  const hit = cache.get(key)
  if (hit) return hit
  const img = getSync(imageId)
  if (!img) return undefined
  const s = buildSilhouette(img, threshold)
  cache.set(key, s)
  return s
}

export function invalidateSilhouette(imageId: string): void {
  for (const k of [...cache.keys()]) if (k.startsWith(imageId + ':')) cache.delete(k)
}

export function buildSilhouette(img: HTMLImageElement, threshold: number): Silhouette {
  const maxSide = 1200
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  let minx = w,
    miny = h,
    maxx = -1,
    maxy = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4
      const on = d[p + 3] >= threshold
      d[p] = 255
      d[p + 1] = 255
      d[p + 2] = 255
      d[p + 3] = on ? 255 : 0
      if (on) {
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
      }
    }
  }
  if (maxx < 0) {
    minx = 0
    miny = 0
    maxx = w - 1
    maxy = h - 1
  }
  const cw = maxx - minx + 1
  const ch = maxy - miny + 1
  const mask = document.createElement('canvas')
  mask.width = cw
  mask.height = ch
  const mctx = mask.getContext('2d')!
  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  full.getContext('2d')!.putImageData(id, 0, 0)
  mctx.drawImage(full, minx, miny, cw, ch, 0, 0, cw, ch)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const cc = canvas.getContext('2d')!
  cc.drawImage(mask, 0, 0)
  return { canvas, mask, offsetX: minx, offsetY: miny, srcW: w, srcH: h }
}

/** Tint a mask canvas with a solid colour (returns a new canvas). */
export function tintMask(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = mask.width
  c.height = mask.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(mask, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  return c
}
