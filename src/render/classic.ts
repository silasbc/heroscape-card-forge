// Classic (2004-2010) army cards: scanned blank frames from the MIT-licensed
// Magic Set Editor template with text, portrait and hit zone composited on top.
// Coordinates are the template's native 728 x 691 pixel space.
import type { CardDesign, Side, StyleId, Portrait } from '../model'
import { generalName, isSquad, statsFor } from '../model'
import layoutsJson from '../data/classicLayouts.json'
import { FONT_BODY, FONT_COND, font } from '../fonts'
import { drawSpaced, fitSingleLine, fitText, wrapLine } from '../text'
import type { RenderEnv } from './env'
import { drawSilhouettes, type HzBox } from './hitzone'
import { fillTokens } from './aoa'
import { getAssetSync } from '../images'

interface Field {
  left: number
  top: number
  width: number
  height: number
  alignment?: string | null
  font?: { family?: string; size?: number; weight?: string; color?: string } | null
  mask?: string | null
}
interface Layout {
  width: number
  height: number
  side: string
  blank: string
  fields: Record<string, Field>
  masks?: Record<string, { file: string; w: number; h: number }>
}

const LAYOUTS = layoutsJson as unknown as Record<string, Layout>

export const CLASSIC_W = 728
export const CLASSIC_H = 691

const CLASSIC_GENERALS = new Set(['jandar', 'utgar', 'ullar', 'vydar', 'einar', 'aquilla', 'valkrill'])

export function classicLayoutKey(style: StyleId, side: Side): string {
  if (side === 'master') return style
  return style === 'rotv' ? 'basic-rotv' : 'basic-sotm'
}

export function classicBlankPath(style: StyleId, side: Side, d: CardDesign): string {
  const key = classicLayoutKey(style, side)
  let g: string = d.general
  if (!CLASSIC_GENERALS.has(g)) g = key === 'rotv' ? 'custom' : 'vydar'
  return `classic/${key}/${g}.jpg`
}

/** Static assets a classic render needs (blank + masks). */
export function classicAssetPaths(style: StyleId, side: Side, d: CardDesign): string[] {
  const key = classicLayoutKey(style, side)
  const paths = [classicBlankPath(style, side, d), `classic/${key}/imagemask.png`, `classic/${key}/imagemask_fogged.png`]
  if (side === 'master') paths.push(`classic/${key}/hzmask.png`, `classic/${key}/textmask.png`)
  if (d.general !== 'custom' || !d.customGeneral.emblemImageId) paths.push(`symbols/${classicSymbol(d)}.png`)
  return paths
}

/** Hit-zone box in classic units (for pointer interaction). */
export function classicHzBox(style: StyleId): HzBox {
  const L = LAYOUTS[classicLayoutKey(style, 'master')]
  const f = L?.fields.hitzone ?? { left: 582, top: 223, width: 128, height: 244 }
  return { cx: f.left + f.width * 0.47, cy: f.top + f.height / 2, w: f.width * 0.9, h: f.height * 0.92 }
}

/** Classic units per portrait-layer unit. */
export function classicLayerScale(style: StyleId, side: Side): number {
  const L = LAYOUTS[classicLayoutKey(style, side)]
  const f = side === 'master' ? L?.fields.image : L?.fields.basicimage
  const ref = side === 'master' ? 470 : 700
  return (f?.height ?? ref) / ref
}

function classicSymbol(d: CardDesign): string {
  return CLASSIC_GENERALS.has(d.general) ? d.general : 'hex'
}

// MSE font sizes are given in points at 96 dpi -> px
const PT = 4 / 3

// ---- mask helpers -----------------------------------------------------------

const alphaMaskCache = new Map<string, HTMLCanvasElement>()
const rowWidthCache = new Map<string, Float32Array>()

/** Convert a luminance mask (white = show) into an alpha canvas. */
function alphaMask(path: string): HTMLCanvasElement | undefined {
  const hit = alphaMaskCache.get(path)
  if (hit) return hit
  const img = getAssetSync(path)
  if (!img) return undefined
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, c.width, c.height)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * (d[i + 3] / 255)
    d[i] = 255
    d[i + 1] = 255
    d[i + 2] = 255
    d[i + 3] = lum
  }
  ctx.putImageData(id, 0, 0)
  alphaMaskCache.set(path, c)
  return c
}

/** For a text mask, the usable width (px) of each row. */
function rowWidths(path: string): Float32Array | undefined {
  const hit = rowWidthCache.get(path)
  if (hit) return hit
  const m = alphaMask(path)
  if (!m) return undefined
  const ctx = m.getContext('2d', { willReadFrequently: true })!
  const id = ctx.getImageData(0, 0, m.width, m.height).data
  const out = new Float32Array(m.height)
  for (let y = 0; y < m.height; y++) {
    let right = 0
    for (let x = m.width - 1; x >= 0; x--) {
      if (id[(y * m.width + x) * 4 + 3] > 128) {
        right = x + 1
        break
      }
    }
    out[y] = right
  }
  rowWidthCache.set(path, out)
  return out
}

// ---- main ------------------------------------------------------------------

export function drawClassic(ctx: CanvasRenderingContext2D, d: CardDesign, side: Side, env: RenderEnv): void {
  const key = classicLayoutKey(d.style, side)
  const L = LAYOUTS[key]
  if (!L) return
  const blank = env.asset(classicBlankPath(d.style, side, d))

  // 1. portrait under the frame? No: the frame is one flat scan, so the
  //    portrait is composited on top through its window mask.
  if (blank) ctx.drawImage(blank, 0, 0, CLASSIC_W, CLASSIC_H)
  else {
    ctx.fillStyle = '#cfd3d6'
    ctx.fillRect(0, 0, CLASSIC_W, CLASSIC_H)
  }

  const imgField = side === 'master' ? L.fields.image : L.fields.basicimage
  const maskPath = `classic/${key}/imagemask.png`
  if (imgField) {
    const p = side === 'master' || d.basicPortrait.sameAsMaster ? d.portrait : d.basicPortrait
    drawPortraitMasked(ctx, p, imgField, maskPath, env, side)
  }

  if (side === 'master') drawMasterText(ctx, d, L, key, env)
  else drawBasicText(ctx, d, L, env)
}

function drawPortraitMasked(
  ctx: CanvasRenderingContext2D,
  p: Portrait,
  f: Field,
  maskPath: string,
  env: RenderEnv,
  side: Side,
): void {
  if (!p.layers.length && p.backdrop.kind !== 'image' && p.backdrop.kind !== 'color') return
  const mask = alphaMask(maskPath)
  // render the window contents into an offscreen canvas at the current pixel scale
  const t = ctx.getTransform()
  const s = Math.max(t.a, 0.25)
  const pw = Math.max(1, Math.round(f.width * s))
  const ph = Math.max(1, Math.round(f.height * s))
  const off = document.createElement('canvas')
  off.width = pw
  off.height = ph
  const o = off.getContext('2d')!
  o.scale(s, s)
  const cx = f.width / 2
  const cy = f.height / 2
  if (p.backdrop.kind === 'color') {
    o.fillStyle = p.backdrop.color
    o.fillRect(0, 0, f.width, f.height)
  } else if (p.backdrop.kind === 'image' && p.backdrop.imageId) {
    const img = env.img(p.backdrop.imageId)
    if (img) {
      const sc = Math.max(f.width / img.naturalWidth, f.height / img.naturalHeight) * (p.backdrop.imageScale || 1)
      const iw = img.naturalWidth * sc
      const ih = img.naturalHeight * sc
      o.drawImage(img, cx - iw / 2 + p.backdrop.imageX, cy - ih / 2 + p.backdrop.imageY, iw, ih)
    }
  }
  // backdrop is masked by the plain window; figures get the fogged mask below
  if (mask) {
    o.setTransform(1, 0, 0, 1, 0, 0)
    o.globalCompositeOperation = 'destination-in'
    o.drawImage(mask, 0, 0, pw, ph)
    o.globalCompositeOperation = 'source-over'
  }
  ctx.drawImage(off, f.left, f.top, f.width, f.height)
  o.setTransform(1, 0, 0, 1, 0, 0)
  o.clearRect(0, 0, pw, ph)
  o.scale(s, s)
  // layer coordinates are in AoA units relative to a 470 (master) / 700 (basic) tall window
  const ref = side === 'master' ? 470 : 700
  const k = f.height / ref
  const lift = side === 'master' ? f.height * 0.16 : f.height * 0.04
  for (const l of p.layers) {
    const img = env.img(l.imageId)
    if (!img) continue
    const h = f.height * l.scale
    const w = (img.naturalWidth / img.naturalHeight) * h
    o.save()
    o.translate(cx + l.x * k, cy - lift + l.y * k)
    if (l.rotation) o.rotate((l.rotation * Math.PI) / 180)
    if (l.flip) o.scale(-1, 1)
    o.shadowColor = 'rgba(0,0,0,0.35)'
    o.shadowBlur = 6
    o.shadowOffsetY = 3
    o.drawImage(img, -w / 2, -h / 2, w, h)
    o.restore()
  }
  const fog = fogBlendMask(maskPath) ?? mask
  if (fog) {
    o.setTransform(1, 0, 0, 1, 0, 0)
    o.globalCompositeOperation = 'destination-in'
    o.drawImage(fog, 0, 0, pw, ph)
  }
  ctx.drawImage(off, f.left, f.top, f.width, f.height)
}

const fogBlendCache = new Map<string, HTMLCanvasElement>()

/** Window mask with the original mist fade, softened so the figure stays readable. */
function fogBlendMask(maskPath: string): HTMLCanvasElement | undefined {
  const hit = fogBlendCache.get(maskPath)
  if (hit) return hit
  const plain = alphaMask(maskPath)
  const fog = alphaMask(fogMaskPath(maskPath))
  if (!plain) return undefined
  if (!fog) return plain
  const c = document.createElement('canvas')
  c.width = plain.width
  c.height = plain.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const a = plain.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
  const b = fog.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height)
  for (let i = 3; i < a.data.length; i += 4) {
    const pa = a.data[i] / 255
    const fa = b.data[i] / 255
    a.data[i] = Math.round(255 * pa * (0.55 + 0.45 * fa))
  }
  ctx.putImageData(a, 0, 0)
  fogBlendCache.set(maskPath, c)
  return c
}

/** The original cards fade the figure into mist near the bottom of the window. */
function fogMaskPath(maskPath: string): string {
  return maskPath.replace('imagemask.png', 'imagemask_fogged.png')
}

function color(f: Field, fallback: string): string {
  const c = f.font?.color
  if (!c || c === 'black') return c === 'black' ? '#121212' : fallback
  return c
}

function drawMasterText(ctx: CanvasRenderingContext2D, d: CardDesign, L: Layout, key: string, env: RenderEnv): void {
  const F = L.fields
  ctx.save()
  ctx.textBaseline = 'alphabetic'

  // general emblem
  const logo = F.generallogo
  const emblem =
    d.general === 'custom' && d.customGeneral.emblemImageId
      ? env.img(d.customGeneral.emblemImageId)
      : env.asset(`symbols/${classicSymbol(d)}.png`)
  if (logo && emblem) {
    const h = (emblem.naturalHeight / emblem.naturalWidth) * logo.width
    ctx.drawImage(emblem, logo.left, logo.top + (logo.height - h) / 2, logo.width, h)
  }

  // name (up to 2 lines, centred)
  if (F.name) {
    const f = F.name
    const fit = fitText(ctx, d.unitName.toUpperCase(), {
      maxWidth: f.width,
      maxHeight: f.height + 4,
      size: (f.font?.size ?? 15) * PT,
      minSize: 9,
      lineHeight: 0.92,
      maxLines: 2,
      fontFor: (s) => font(700, s, FONT_COND),
    })
    ctx.font = font(700, fit.size, FONT_COND)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    const total = fit.lines.length * fit.lineHeight
    let y = f.top + f.height / 2 - total / 2 + fit.size * 0.82
    for (const line of fit.lines) {
      drawSpaced(ctx, line, f.left + f.width / 2, y, 0.2, 'center')
      y += fit.lineHeight
    }
  }
  if (F.general) {
    const f = F.general
    const txt = generalName(d).toUpperCase()
    const s = fitSingleLine(ctx, txt, f.width, (f.font?.size ?? 10) * PT, 7, (sz) => font(700, sz, FONT_COND))
    ctx.font = font(700, s, FONT_COND)
    ctx.fillStyle = '#ffffff'
    drawSpaced(ctx, txt, f.left + f.width / 2, f.top + f.height / 2 + s * 0.35, 0.6, 'center')
  }

  // left box: right-aligned caps
  const leftLines: [string, string][] = [
    ['species', d.species],
    ['type', d.unitType],
    ['class', d.unitClass],
    ['personality', d.personality],
  ]
  for (const [k, v] of leftLines) {
    const f = F[k]
    if (!f || !v) continue
    const txt = v.toUpperCase()
    const s = fitSingleLine(ctx, txt, f.width, (f.font?.size ?? 11) * PT, 6.5, (sz) => font(700, sz, FONT_COND))
    ctx.font = font(700, s, FONT_COND)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(txt, f.left + f.width, f.top + f.height / 2 + s * 0.36)
  }
  if (F.size) {
    const f = F.size
    const txt = `${d.sizeCategory.toUpperCase()} ${d.height}`
    const s = fitSingleLine(ctx, txt, f.width, (f.font?.size ?? 15) * PT, 9, (sz) => font(700, sz, FONT_COND))
    ctx.font = font(700, s, FONT_COND)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'right'
    ctx.fillText(txt, f.left + f.width, f.top + f.height / 2 + s * 0.36)
  }

  // stats
  const stat = (k: string, v: number | string, col = '#ffffff') => {
    const f = F[k]
    if (!f) return
    const s = (f.font?.size ?? 18) * PT
    ctx.font = font(700, s, FONT_COND)
    ctx.fillStyle = col
    ctx.textAlign = 'center'
    ctx.fillText(String(v), f.left + f.width / 2, f.top + s * 0.86)
  }
  stat('life', d.life)
  stat('move', d.move)
  stat('range', d.range)
  stat('attack', d.attack)
  stat('defense', d.defense)
  const pointsColor = d.general === 'jandar' ? 'rgb(70,70,70)' : d.general === 'valkrill' ? 'rgb(40,40,40)' : '#ffffff'
  stat('points', d.points, pointsColor)
  const ext = (k: string, txt: string) => {
    const f = F[k]
    if (!f) return
    const s = (f.font?.size ?? 9) * PT * 0.9
    ctx.font = font(500, s, FONT_COND)
    ctx.fillStyle = color(f, '#ffffff')
    ctx.textAlign = 'center'
    drawSpaced(ctx, txt, f.left + f.width / 2, f.top + f.height / 2 + s * 0.35, 0.5, 'center')
  }
  ext('move ext', d.move === 1 ? 'SPACE' : 'SPACES')
  ext('range ext', d.range === 1 ? 'SPACE' : 'SPACES')
  ext('attack ext', d.attack === 1 ? 'DIE' : 'DICE')
  ext('defense ext', d.defense === 1 ? 'DIE' : 'DICE')

  // hit zone
  const hzf = F.hitzone
  if (hzf) {
    const mask = alphaMask(`classic/${key}/hzmask.png`)
    ctx.save()
    if (mask) {
      // clip to the mask by drawing into an offscreen layer
      const t = ctx.getTransform()
      const s = Math.max(t.a, 0.25)
      const off = document.createElement('canvas')
      off.width = Math.max(1, Math.round(hzf.width * s))
      off.height = Math.max(1, Math.round(hzf.height * s))
      const o = off.getContext('2d')!
      o.scale(s, s)
      o.translate(-hzf.left, -hzf.top)
      drawSilhouettes(o, d, env, { cx: hzf.left + hzf.width * 0.47, cy: hzf.top + hzf.height / 2, w: hzf.width * 0.9, h: hzf.height * 0.92 })
      o.setTransform(1, 0, 0, 1, 0, 0)
      o.globalCompositeOperation = 'destination-in'
      o.drawImage(mask, 0, 0, off.width, off.height)
      ctx.drawImage(off, hzf.left, hzf.top, hzf.width, hzf.height)
    } else {
      drawSilhouettes(ctx, d, env, { cx: hzf.left + hzf.width * 0.47, cy: hzf.top + hzf.height / 2, w: hzf.width * 0.9, h: hzf.height * 0.92 })
    }
    ctx.restore()
  }

  // powers, following the curved text mask
  const ab = F.abilities
  if (ab) drawAbilities(ctx, d, ab, `classic/${key}/textmask.png`)

  if (isSquad(d) && d.figuresInSquad > 1) {
    ctx.font = font(600, 9, FONT_COND)
    ctx.fillStyle = '#121212'
    ctx.textAlign = 'center'
    ctx.fillText(`${d.figuresInSquad} FIGURES`, 240, 655)
  }
  ctx.restore()
}

function drawAbilities(ctx: CanvasRenderingContext2D, d: CardDesign, f: Field, maskPath: string): void {
  const widths = rowWidths(maskPath)
  const maskH = widths ? widths.length : f.height
  const maskW = alphaMaskWidth(maskPath) || f.width
  const widthAt = (y: number): number => {
    if (!widths) return f.width
    const row = Math.min(maskH - 1, Math.max(0, Math.round(((y - f.top) / f.height) * maskH)))
    const a = widths[row] || 0
    const b = widths[Math.min(maskH - 1, row + 2)] || a
    return Math.max(40, (Math.min(a, b) * f.width) / maskW)
  }
  const powers = d.powers.filter((p) => p.name.trim() || p.text.trim())
  const base = (f.font?.size ?? 12) * PT
  const maxH = f.height
  type Item = { name: string; nameSize: number; lines: { text: string; y: number }[]; bodySize: number }
  let best: Item[] = []
  for (let scale = 1; scale >= 0.45; scale -= 0.04) {
    const nameSize = base * scale
    const bodySize = base * 0.92 * scale
    const lineH = bodySize * 1.17
    const gap = bodySize * 0.9
    let y = f.top + nameSize * 0.9
    const items: Item[] = []
    let overflow = false
    for (const p of powers) {
      const it: Item = { name: p.name.toUpperCase(), nameSize, lines: [], bodySize }
      if (p.name.trim()) y += nameSize * 1.1
      ctx.font = font(400, bodySize, FONT_BODY)
      const text = fillTokens(p.text, d)
      for (const para of text.split('\n')) {
        let rest = para.split(/\s+/).filter(Boolean)
        if (!rest.length) continue
        while (rest.length) {
          const w = widthAt(y)
          const words = wrapLine(ctx, rest.join(' '), w)
          const first = words[0] ?? rest.join(' ')
          it.lines.push({ text: first, y })
          const used = first.split(/\s+/).filter(Boolean).length
          rest = rest.slice(Math.max(1, used))
          y += lineH
        }
      }
      y += gap
      items.push(it)
      if (y - f.top > maxH + gap) {
        overflow = true
        break
      }
    }
    best = items
    if (!overflow) break
  }
  ctx.save()
  ctx.fillStyle = '#121212'
  ctx.textAlign = 'left'
  for (const it of best) {
    if (it.name) {
      ctx.font = font(700, it.nameSize, FONT_COND)
      const firstY = it.lines[0]?.y ?? f.top + it.nameSize
      ctx.fillText(it.name, f.left, firstY - it.nameSize * 1.1 + it.nameSize * 0.3)
    }
    ctx.font = font(400, it.bodySize, FONT_BODY)
    for (const ln of it.lines) ctx.fillText(ln.text, f.left, ln.y)
  }
  ctx.restore()
}

function alphaMaskWidth(path: string): number {
  return alphaMask(path)?.width ?? 0
}

function drawBasicText(ctx: CanvasRenderingContext2D, d: CardDesign, L: Layout, env: RenderEnv): void {
  const F = L.fields
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  const logo = F.generallogo
  const emblem =
    d.general === 'custom' && d.customGeneral.emblemImageId
      ? env.img(d.customGeneral.emblemImageId)
      : env.asset(`symbols/${classicSymbol(d)}.png`)
  if (logo && emblem) {
    const h = (emblem.naturalHeight / emblem.naturalWidth) * logo.width
    ctx.drawImage(emblem, logo.left, logo.top + (logo.height - h) / 2, logo.width, h)
  }
  if (F.name) {
    const f = F.name
    const fit = fitText(ctx, d.unitName.toUpperCase(), {
      maxWidth: f.width,
      maxHeight: f.height + 4,
      size: (f.font?.size ?? 15) * PT,
      minSize: 9,
      lineHeight: 0.92,
      maxLines: 2,
      fontFor: (s) => font(700, s, FONT_COND),
    })
    ctx.font = font(700, fit.size, FONT_COND)
    ctx.fillStyle = '#ffffff'
    const total = fit.lines.length * fit.lineHeight
    let y = f.top + f.height / 2 - total / 2 + fit.size * 0.82
    for (const line of fit.lines) {
      drawSpaced(ctx, line, f.left + f.width / 2, y, 0.2, 'center')
      y += fit.lineHeight
    }
    // general under the name
    const gl = generalName(d).toUpperCase()
    ctx.font = font(700, 12, FONT_COND)
    drawSpaced(ctx, gl, f.left + f.width / 2, f.top + f.height + 13, 0.6, 'center')
  }
  const text = (k: string, v: string, weight = 400) => {
    const f = F[k]
    if (!f || !v) return
    const s = fitSingleLine(ctx, v, f.width, (f.font?.size ?? 12) * PT * 0.85, 7, (sz) => font(weight, sz, FONT_COND))
    ctx.font = font(weight, s, FONT_COND)
    ctx.fillStyle = '#121212'
    ctx.textAlign = 'center'
    ctx.fillText(v, f.left + f.width / 2, f.top + f.height / 2 + s * 0.35)
  }
  text('planet', d.footer.homeworld, 700)
  text('expansion', d.footer.setName)
  text('collector number', d.footer.collection)
  const stat = (k: string, v: number) => {
    const f = F[k]
    if (!f) return
    const s = (f.font?.size ?? 21) * PT * 0.9
    ctx.font = font(700, s, FONT_COND)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(String(v), f.left + f.width / 2, f.top + s * 0.86)
  }
  const st = statsFor(d, 'basic')
  stat('bmove', st.move)
  stat('brange', st.range)
  stat('battack', st.attack)
  stat('bdefense', st.defense)
  const ext = (k: string, txt: string) => {
    const f = F[k]
    if (!f) return
    const s = (f.font?.size ?? 9) * PT * 0.9
    ctx.font = font(500, s, FONT_COND)
    ctx.fillStyle = '#ffffff'
    drawSpaced(ctx, txt, f.left + f.width / 2, f.top + f.height / 2 + s * 0.35, 0.5, 'center')
  }
  ext('bmove ext', st.move === 1 ? 'SPACE' : 'SPACES')
  ext('brange ext', st.range === 1 ? 'SPACE' : 'SPACES')
  ext('battack ext', st.attack === 1 ? 'DIE' : 'DICE')
  ext('bdefense ext', st.defense === 1 ? 'DIE' : 'DICE')
  if (d.footer.credit) {
    ctx.font = font(500, 8, FONT_COND)
    ctx.fillStyle = '#121212'
    ctx.textAlign = 'center'
    ctx.fillText(d.footer.credit, 470, 640)
  }
  ctx.restore()
}
