// Renderer entry point: picks the style, supplies the environment, and
// rasterises a card into any canvas at any pixel size.
import type { CardDesign, Side, StyleId } from '../model'
import { imageIdsOf } from '../model'
import { CARD_H, CARD_W, PHYSICAL_W_IN } from '../geometry'
import { getAssetSync, getSync, loadAsset, preload } from '../images'
import { getSilhouetteSync, tintMask, type Silhouette } from '../cutout/silhouette'
import type { RenderEnv } from './env'
import { drawAoa, hzBox as aoaHzBox, layerFrame } from './aoa'
import { CLASSIC_H, CLASSIC_W, classicAssetPaths, classicHzBox, classicLayerScale, drawClassic } from './classic'
import type { HzBox } from './hitzone'

export function cardUnits(style: StyleId): { w: number; h: number } {
  return style === 'aoa' ? { w: CARD_W, h: CARD_H } : { w: CLASSIC_W, h: CLASSIC_H }
}

/** Physical size in inches for a given style. */
export function cardInches(style: StyleId): { w: number; h: number } {
  const u = cardUnits(style)
  return { w: PHYSICAL_W_IN, h: (PHYSICAL_W_IN * u.h) / u.w }
}

/** Hit-zone box in the style's unit space (for pointer interaction). */
export function hzBoxFor(style: StyleId): HzBox {
  return style === 'aoa' ? aoaHzBox() : classicHzBox(style)
}

/** Units of style space per unit of portrait-layer coordinate space. */
export function layerScaleFor(style: StyleId, side: Side): number {
  return style === 'aoa' ? 1 : classicLayerScale(style, side)
}

export { layerFrame }

const tintCache = new WeakMap<Silhouette, Map<string, HTMLCanvasElement>>()
const paintCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()

export const env: RenderEnv = {
  img: (id) => getSync(id),
  asset: (path) => getAssetSync(path),
  silhouette: (id, threshold) => getSilhouetteSync(id, threshold),
  tinted(sil, color) {
    let m = tintCache.get(sil)
    if (!m) {
      m = new Map()
      tintCache.set(sil, m)
    }
    let c = m.get(color)
    if (!c) {
      c = tintMask(sil.mask, color)
      m.set(color, c)
    }
    return c
  },
  maskedPaint(sil, paint, color) {
    let m = paintCache.get(paint)
    if (!m) {
      m = new Map()
      paintCache.set(paint, m)
    }
    const key = color + ':' + sil.canvas.width + 'x' + sil.canvas.height + ':' + sil.offsetX + ',' + sil.offsetY
    let c = m.get(key)
    if (!c) {
      c = document.createElement('canvas')
      c.width = sil.canvas.width
      c.height = sil.canvas.height
      const ctx = c.getContext('2d')!
      // the paint image covers the silhouette's (downscaled) source grid
      ctx.drawImage(paint, -sil.offsetX, -sil.offsetY, sil.srcW, sil.srcH)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = color
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(sil.mask, 0, 0)
      m.set(key, c)
    }
    return c
  },
}

/** Load every image and static asset the card needs before drawing. */
export async function ensureAssets(d: CardDesign, sides: Side[] = ['master', 'basic']): Promise<void> {
  const ids = imageIdsOf(d)
  const assets = new Set<string>()
  if (d.style === 'aoa') {
    assets.add('symbols/hex.png')
    if (d.general !== 'custom') assets.add(`symbols/aoa/${d.general}.png`)
  } else {
    for (const s of sides) classicAssetPaths(d.style, s, d).forEach((p) => assets.add(p))
  }
  await Promise.all([preload(ids), ...[...assets].map((p) => loadAsset(p))])
}

/** Draw the card in unit space; the caller sets the transform. */
export function drawCard(ctx: CanvasRenderingContext2D, d: CardDesign, side: Side): void {
  if (d.style === 'aoa') drawAoa(ctx, d, side, env)
  else drawClassic(ctx, d, side, env)
}

/** Rasterise into a canvas `pixelWidth` wide (height follows the style). */
export function renderToCanvas(
  d: CardDesign,
  side: Side,
  pixelWidth: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
  background: string | null = null,
): HTMLCanvasElement {
  const u = cardUnits(d.style)
  const scale = pixelWidth / u.w
  const w = Math.max(1, Math.round(pixelWidth))
  const h = Math.max(1, Math.round(u.h * scale))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawCard(ctx, d, side)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas
}
