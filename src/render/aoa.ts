// Age of Annihilation (2024 Renegade) army card, drawn fully as vectors in a
// 1000 x 940 unit space. Master side and Basic side. Positions were measured
// from official 1575 x 1500 renders (1 unit = 1.465 px there).
import type { CardDesign, Side, Portrait } from '../model'
import { generalName } from '../model'
import { CARD_H, CARD_W, OUTLINE, insetPolygon, polygonPath, type Pt } from '../geometry'
import { FONT_BODY, FONT_COND, font } from '../fonts'
import { drawSpaced, fitSingleLine, fitText, wrapText } from '../text'
import { hexA, paletteFor, shade, STAT_COLORS, type Palette } from './palette'
import { distress, hexGrid, speckles, splat } from './textures'
import type { RenderEnv } from './env'
import { drawSilhouettes, type HzBox } from './hitzone'

const BORDER = 36
const INNER: Pt[] = insetPolygon(OUTLINE, BORDER)
const OUTER_PATH = polygonPath(OUTLINE)
const INNER_PATH = polygonPath(INNER)

export const AOA = {
  emblem: { cx: 319, cy: 106, w: 72 },
  generalLabel: { x: 241, y: 176 },
  name: { x: 241, top: 184, w: 280, h: 62 },
  powers: { x: 240, top: 278, w: 292, bottom: 808 },
  leftPanel: { cx: 121, lines: [423, 451, 480, 508], sizeLine: 537, w: 168 },
  hz: { poly: [[790, 318], [966, 420], [966, 520], [790, 622]] as Pt[], box: { cx: 876, cy: 472, w: 176, h: 304 } as HzBox },
  plaque: { poly: [[697, 456], [799, 514], [799, 717], [697, 775], [595, 717], [595, 514]] as Pt[], cx: 697 },
  plaqueBasic: { poly: [[697, 528], [799, 586], [799, 782], [697, 840], [595, 782], [595, 586]] as Pt[], cx: 697 },
  bars: { x: 608, w: 174, y0: 547, pitch: 41, h: 33, labelX: 618, valueX: 748 },
  basic: {
    emblem: { cx: 272, cy: 557, w: 90 },
    generalLabel: { x: 241, y: 641 },
    name: { x: 241, top: 650, w: 330, h: 82 },
    collector: { cx: 322, lines: [773, 796, 818] },
    bars: { y0: 618, h: 35, pitch: 41 },
    artBottom: 748,
  },
}

export function hzBox(): HzBox {
  return AOA.hz.box
}

export function drawAoa(ctx: CanvasRenderingContext2D, d: CardDesign, side: Side, env: RenderEnv): void {
  const pal = paletteFor(d)
  ctx.save()
  ctx.clip(OUTER_PATH)

  // Border band with distressing
  ctx.fillStyle = pal.border
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  distress(ctx, OUTLINE, INNER, { seed: 7, count: 260, color: 'rgba(250,246,232,0.9)', maxLen: 9 })
  distress(ctx, OUTLINE, INNER, { seed: 11, count: 90, color: pal.borderDark, maxLen: 6 })

  if (side === 'master') {
    drawParchment(ctx, INNER_PATH, 560, 760)
    drawMaster(ctx, d, env, pal)
  } else {
    drawBasic(ctx, d, env, pal)
  }

  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 2.5
  ctx.stroke(INNER_PATH)
  ctx.restore()
  ctx.restore()
}

function drawParchment(ctx: CanvasRenderingContext2D, clip: Path2D, fadeFrom: number, fadeTo: number): void {
  ctx.save()
  ctx.fillStyle = STAT_COLORS.parchment
  ctx.fill(clip)
  speckles(ctx, clip, { x0: 0, y0: 0, x1: CARD_W, y1: CARD_H, count: 900, color: '#8fa36a', seed: 3, maxR: 1.6 })
  speckles(ctx, clip, { x0: 0, y0: 0, x1: CARD_W, y1: CARD_H, count: 300, color: '#b8a77a', seed: 5, maxR: 2.2 })
  hexGrid(ctx, clip, {
    x0: 0,
    y0: 380,
    x1: CARD_W,
    y1: CARD_H,
    r: 21,
    color: 'rgba(196,178,122,0.5)',
    fadeFrom,
    fadeTo,
    lineWidth: 1.1,
  })
  ctx.restore()
}

// ---------------------------------------------------------------- master

function drawMaster(ctx: CanvasRenderingContext2D, d: CardDesign, env: RenderEnv, pal: Palette): void {
  // art window: right of the text column, down to the plate
  const win = new Path2D()
  win.moveTo(533, -80)
  win.lineTo(1100, -80)
  win.lineTo(1100, 470)
  win.lineTo(697, 470)
  win.lineTo(533, 470)
  win.closePath()
  drawPortrait(ctx, d.portrait, win, { x: 533, y: 0, w: 467, h: 470 }, env, pal, 'master')
  drawHitZone(ctx, d, env, pal)
  drawNamePanel(ctx, d, env, pal)
  drawLeftPanel(ctx, d, pal)
  drawPowers(ctx, d)
  drawPlaque(ctx, d, 'master')
  drawSquadCount(ctx, d)
}

// ---------------------------------------------------------------- basic

function artBottomPath(): Path2D {
  // everything above this curve is art on the Basic side
  const p = new Path2D()
  p.moveTo(-60, AOA.basic.artBottom)
  p.quadraticCurveTo(500, AOA.basic.artBottom - 30, 1060, AOA.basic.artBottom + 8)
  p.lineTo(1060, -80)
  p.lineTo(-60, -80)
  p.closePath()
  return p
}

function drawBasic(ctx: CanvasRenderingContext2D, d: CardDesign, env: RenderEnv, pal: Palette): void {
  // parchment everywhere first (shows below the art curve)
  drawParchment(ctx, INNER_PATH, 620, 800)
  const p = d.basicPortrait.sameAsMaster ? d.portrait : d.basicPortrait
  const art = artBottomPath()
  drawPortrait(ctx, p, art, { x: 0, y: 0, w: 1000, h: AOA.basic.artBottom }, env, pal, 'basic')

  // deep plum plate over the lower-left of the art
  ctx.save()
  ctx.clip(INNER_PATH)
  ctx.clip(art)
  const g = ctx.createLinearGradient(0, 500, 0, AOA.basic.artBottom)
  g.addColorStop(0, 'rgba(53,28,72,0)')
  g.addColorStop(0.45, 'rgba(53,28,72,0.82)')
  g.addColorStop(1, 'rgba(50,24,70,1)')
  ctx.fillStyle = g
  ctx.fillRect(-60, 480, 660, 300)
  ctx.restore()

  // crest, general, name
  const b = AOA.basic
  const emblem = emblemImage(d, env)
  if (emblem) {
    const h = (emblem.naturalHeight / emblem.naturalWidth) * b.emblem.w
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 3
    ctx.drawImage(emblem, b.emblem.cx - b.emblem.w / 2, b.emblem.cy - h / 2, b.emblem.w, h)
    ctx.restore()
  }
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(500, 26, FONT_COND)
  drawSpaced(ctx, generalName(d).toUpperCase(), b.generalLabel.x, b.generalLabel.y, 1.4, 'left')
  const fit = fitText(ctx, d.unitName.toUpperCase(), {
    maxWidth: b.name.w,
    maxHeight: b.name.h,
    size: 40,
    minSize: 18,
    lineHeight: 1.0,
    maxLines: 2,
    fontFor: (s) => font(600, s, FONT_COND),
  })
  ctx.font = font(600, fit.size, FONT_COND)
  let y = b.name.top + fit.size * 0.82
  if (fit.lines.length === 1) y = b.name.top + fit.size * 0.82
  for (const line of fit.lines) {
    drawSpaced(ctx, line, b.name.x, y, 0.4, 'left')
    y += fit.lineHeight
  }
  ctx.restore()

  // collector block on the parchment strip
  ctx.save()
  ctx.fillStyle = STAT_COLORS.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const f = d.footer
  const rows: [string, string][] = [
    [f.homeworld, font(600, 21, FONT_BODY)],
    [f.collection, font(400, 21, FONT_BODY)],
    [f.setName, `italic 400 19px "${FONT_BODY}", Arial, sans-serif`],
  ]
  rows.forEach(([txt, fnt], i) => {
    if (!txt) return
    ctx.font = fnt
    const s = fitSingleLine(ctx, txt, 300, 21, 12, () => fnt)
    void s
    ctx.fillText(txt, b.collector.cx, b.collector.lines[i])
  })
  ctx.restore()

  drawPlaque(ctx, d, 'basic')

  // credit, rotated along the lower-right edge like the official copyright line
  if (d.footer.credit) {
    ctx.save()
    ctx.translate(722, 862)
    ctx.rotate(-Math.PI / 6)
    ctx.fillStyle = STAT_COLORS.ink
    ctx.font = font(400, 13, FONT_BODY)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(d.footer.credit, 0, 0)
    ctx.restore()
  }
}

// ---------------------------------------------------------------- portrait

function drawPortrait(
  ctx: CanvasRenderingContext2D,
  p: Portrait,
  winPath: Path2D,
  win: { x: number; y: number; w: number; h: number },
  env: RenderEnv,
  pal: Palette,
  side: Side,
): void {
  const cx = win.x + win.w / 2
  const cy = win.y + win.h / 2
  const bd = p.backdrop
  ctx.save()
  ctx.clip(INNER_PATH)
  ctx.clip(winPath)
  if (bd.kind === 'general' || bd.kind === 'color') {
    const top = bd.kind === 'general' ? pal.backdropTop : shade(bd.color, 0.35)
    const bottom = bd.kind === 'general' ? pal.backdropBottom : shade(bd.color, -0.45)
    const glow = bd.kind === 'general' ? pal.backdropGlow : shade(bd.color, 0.75)
    const ground = bd.kind === 'general' ? pal.ground : shade(bd.color, -0.25)
    const g = ctx.createLinearGradient(0, win.y, 0, win.y + win.h)
    g.addColorStop(0, top)
    g.addColorStop(0.64, bottom)
    g.addColorStop(0.66, ground)
    g.addColorStop(1, shade(ground, -0.5))
    ctx.fillStyle = g
    ctx.fillRect(-100, -100, CARD_W + 200, CARD_H + 200)
    const rg = ctx.createRadialGradient(cx, win.y + win.h * 0.34, 10, cx, win.y + win.h * 0.34, win.w * 0.75)
    rg.addColorStop(0, hexA(glow, 0.7))
    rg.addColorStop(1, hexA(glow, 0))
    ctx.fillStyle = rg
    ctx.fillRect(-100, -100, CARD_W + 200, CARD_H + 200)
    const hz = ctx.createLinearGradient(0, win.y + win.h * 0.52, 0, win.y + win.h * 0.68)
    hz.addColorStop(0, 'rgba(255,255,255,0)')
    hz.addColorStop(0.8, 'rgba(255,255,255,0.3)')
    hz.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = hz
    ctx.fillRect(-100, -100, CARD_W + 200, CARD_H + 200)
    speckles(ctx, winPath, { x0: win.x, y0: win.y, x1: win.x + win.w, y1: win.y + win.h, count: 250, color: glow, seed: 17, maxR: 1.2 })
  } else if (bd.kind === 'image' && bd.imageId) {
    const img = env.img(bd.imageId)
    if (img) {
      const s = Math.max(win.w / img.naturalWidth, win.h / img.naturalHeight) * (bd.imageScale || 1)
      const iw = img.naturalWidth * s
      const ih = img.naturalHeight * s
      ctx.drawImage(img, cx - iw / 2 + bd.imageX, cy - ih / 2 + bd.imageY, iw, ih)
    }
  }
  ctx.restore()

  // figure layers
  ctx.save()
  ctx.clip(INNER_PATH)
  if (!p.overflow) ctx.clip(winPath)
  const { ref, refCx, refCy } = layerFrame(side)
  for (const l of p.layers) {
    const img = env.img(l.imageId)
    if (!img) continue
    const h = ref * l.scale
    const w = (img.naturalWidth / img.naturalHeight) * h
    ctx.save()
    ctx.translate(refCx + l.x, refCy + l.y)
    if (l.rotation) ctx.rotate((l.rotation * Math.PI) / 180)
    if (l.flip) ctx.scale(-1, 1)
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
  ctx.restore()
}

/** Reference frame for portrait layers (shared with the classic renderer). */
export function layerFrame(side: Side): { ref: number; refCx: number; refCy: number } {
  return side === 'master' ? { ref: 470, refCx: 766, refCy: 235 } : { ref: 700, refCx: 500, refCy: 360 }
}

// ---------------------------------------------------------------- panels

function namePanelPath(): Path2D {
  const p = new Path2D()
  p.moveTo(-20, 262)
  p.quadraticCurveTo(300, 266, 533, 228)
  p.lineTo(533, -60)
  p.lineTo(-20, -60)
  p.closePath()
  return p
}

function leftPanelPath(): Path2D {
  const p = new Path2D()
  p.moveTo(-20, 296)
  p.lineTo(200, 296)
  p.quadraticCurveTo(262, 470, 176, 646)
  p.lineTo(-20, 646)
  p.closePath()
  return p
}

function panelGradient(ctx: CanvasRenderingContext2D, pal: Palette, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, pal.panelTop)
  g.addColorStop(1, pal.panelBottom)
  return g
}

function emblemImage(d: CardDesign, env: RenderEnv): HTMLImageElement | undefined {
  if (d.general === 'custom') {
    return d.customGeneral.emblemImageId ? env.img(d.customGeneral.emblemImageId) : env.asset('symbols/hex.png')
  }
  return env.asset(`symbols/aoa/${d.general}.png`) ?? env.asset(`symbols/${d.general}.png`)
}

function drawNamePanel(ctx: CanvasRenderingContext2D, d: CardDesign, env: RenderEnv, pal: Palette): void {
  ctx.save()
  ctx.clip(INNER_PATH)
  const path = namePanelPath()
  ctx.fillStyle = panelGradient(ctx, pal, 0, 262)
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 6
  ctx.fill(path)
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke(path)
  ctx.restore()

  const e = AOA.emblem
  const emblem = emblemImage(d, env)
  if (emblem) {
    const h = (emblem.naturalHeight / emblem.naturalWidth) * e.w
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 3
    ctx.drawImage(emblem, e.cx - e.w / 2, e.cy - h / 2, e.w, h)
    ctx.restore()
  }

  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(500, 24, FONT_COND)
  drawSpaced(ctx, generalName(d).toUpperCase(), AOA.generalLabel.x, AOA.generalLabel.y, 1.4, 'left')

  const nm = AOA.name
  const fit = fitText(ctx, d.unitName.toUpperCase(), {
    maxWidth: nm.w,
    maxHeight: nm.h,
    size: 33,
    minSize: 16,
    lineHeight: 0.96,
    maxLines: 3,
    fontFor: (s) => font(600, s, FONT_COND),
  })
  ctx.font = font(600, fit.size, FONT_COND)
  let y = nm.top + fit.size * 0.74
  for (const line of fit.lines) {
    drawSpaced(ctx, line, nm.x, y, 0.4, 'left')
    y += fit.lineHeight
  }
  ctx.restore()
}

function drawLeftPanel(ctx: CanvasRenderingContext2D, d: CardDesign, pal: Palette): void {
  ctx.save()
  ctx.clip(INNER_PATH)
  const path = leftPanelPath()
  ctx.fillStyle = panelGradient(ctx, pal, 296, 646)
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 6
  ctx.fill(path)
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke(path)
  ctx.restore()

  const lp = AOA.leftPanel
  const lines = [d.species, d.unitType, d.unitClass, d.personality].map((s) => (s || '').toUpperCase())
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => {
    if (!line) return
    const s = fitSingleLine(ctx, line, lp.w, 21, 10, (sz) => font(500, sz, FONT_COND))
    ctx.font = font(500, s, FONT_COND)
    drawSpaced(ctx, line, lp.cx, lp.lines[i], 0.5, 'center')
  })
  const sizeLine = `${d.sizeCategory.toUpperCase()} ${d.height}`
  const ss = fitSingleLine(ctx, sizeLine, lp.w, 23, 11, (sz) => font(700, sz, FONT_COND))
  ctx.font = font(700, ss, FONT_COND)
  drawSpaced(ctx, sizeLine, lp.cx, lp.sizeLine, 0.5, 'center')
  ctx.restore()
}

// ---------------------------------------------------------------- powers

interface PowerLayout {
  scale: number
  items: { name: string; nameSize: number; lines: string[]; bodySize: number; lineH: number }[]
  total: number
}

function layoutPowers(ctx: CanvasRenderingContext2D, d: CardDesign, width: number, maxHeight: number): PowerLayout {
  const powers = d.powers.filter((p) => p.name.trim() || p.text.trim())
  let last: PowerLayout = { scale: 1, items: [], total: 0 }
  for (let scale = 1; scale >= 0.5; scale -= 0.035) {
    const nameSize = 22 * scale
    const bodySize = 19.5 * scale
    const lineH = bodySize * 1.19
    const gap = 14 * scale
    let total = 0
    const items: PowerLayout['items'] = []
    for (const p of powers) {
      ctx.font = font(400, bodySize, FONT_BODY)
      const text = fillTokens(p.text, d)
      const lines = text.trim() ? wrapText(ctx, text, width) : []
      const nameH = p.name.trim() ? nameSize * 1.12 : 0
      total += nameH + lines.length * lineH + gap
      items.push({ name: p.name.toUpperCase(), nameSize, lines, bodySize, lineH })
    }
    total -= gap
    last = { scale, items, total }
    if (total <= maxHeight) return last
  }
  return last
}

/** Replace library tokens with this card's name and pronouns. */
export function fillTokens(text: string, d: CardDesign): string {
  const pron = {
    he: ['he', 'him', 'his'],
    she: ['she', 'her', 'her'],
    it: ['it', 'it', 'its'],
    they: ['they', 'them', 'their'],
  }[d.pronoun]
  const name = d.unitName || 'this figure'
  const out = text
    .replace(/\{NAME\}/g, name)
    .replace(/\{LIFE\}/g, String(d.life))
    .replace(/\{HE\}/g, pron[0])
    .replace(/\{HIM\}/g, pron[1])
    .replace(/\{HIS\}/g, pron[2])
    .replace(/\{N_PLURAL:([^|}]*)\|([^}]*)\}/g, '$2')
    .replace(/\{N_PLURAL\}/g, 'figures')
    .replace(/\{N_WORD\}/g, 'one')
    .replace(/\{N-1\}/g, '1')
    .replace(/\{N\}/g, '1')
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
}

function drawPowers(ctx: CanvasRenderingContext2D, d: CardDesign): void {
  const box = AOA.powers
  const lay = layoutPowers(ctx, d, box.w, box.bottom - box.top)
  ctx.save()
  ctx.fillStyle = STAT_COLORS.ink
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  let y = box.top
  const gap = 14 * lay.scale
  for (const it of lay.items) {
    if (it.name) {
      ctx.font = font(700, it.nameSize, FONT_COND)
      y += it.nameSize * 0.78
      drawSpaced(ctx, it.name, box.x, y, 0.3, 'left')
      y += it.nameSize * 0.34
    }
    ctx.font = font(400, it.bodySize, FONT_BODY)
    for (const line of it.lines) {
      y += it.lineH
      ctx.fillText(line, box.x, y - it.lineH * 0.27)
    }
    y += gap
  }
  ctx.restore()
}

// ---------------------------------------------------------------- hit zone

function drawHitZone(ctx: CanvasRenderingContext2D, d: CardDesign, env: RenderEnv, pal: Palette): void {
  const hz = AOA.hz
  const path = polygonPath(hz.poly)
  ctx.save()
  ctx.clip(INNER_PATH)
  // official cards use a blurred, darkened slice of the art here
  const g = ctx.createLinearGradient(hz.poly[0][0], hz.poly[0][1], hz.poly[2][0], hz.poly[2][1])
  g.addColorStop(0, pal.hzTop)
  g.addColorStop(1, pal.hzBottom)
  ctx.fillStyle = g
  ctx.fill(path)
  const rg = ctx.createRadialGradient(hz.box.cx, hz.box.cy, 20, hz.box.cx, hz.box.cy, 200)
  rg.addColorStop(0, 'rgba(255,255,255,0.10)')
  rg.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = rg
  ctx.fill(path)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke(path)
  ctx.clip(path)
  drawSilhouettes(ctx, d, env, hz.box)
  ctx.restore()
}

// ---------------------------------------------------------------- stat plaque

function drawPlaque(ctx: CanvasRenderingContext2D, d: CardDesign, side: Side): void {
  const master = side === 'master'
  const pq = master ? AOA.plaque : AOA.plaqueBasic
  const poly = pq.poly
  const outer = polygonPath(poly)
  const inner = polygonPath(insetPolygon(poly, 6))
  const top = poly[0][1]
  const bottom = poly[3][1]
  ctx.save()
  const rim = ctx.createLinearGradient(595, top, 799, bottom)
  rim.addColorStop(0, '#dcdcdc')
  rim.addColorStop(0.45, '#8a8a8a')
  rim.addColorStop(1, '#2c2c2c')
  ctx.fillStyle = rim
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 7
  ctx.shadowOffsetY = 3
  ctx.fill(outer)
  ctx.shadowColor = 'transparent'
  const body = ctx.createLinearGradient(0, top, 0, bottom)
  body.addColorStop(0, STAT_COLORS.plaqueLight)
  body.addColorStop(1, STAT_COLORS.plaqueDark)
  ctx.fillStyle = body
  ctx.fill(inner)
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'
  ctx.lineWidth = 2
  ctx.stroke(inner)
  speckles(ctx, inner, { x0: 595, y0: top, x1: 799, y1: bottom, count: 600, color: '#e6e6e6', seed: 21, maxR: 1.1 })
  speckles(ctx, inner, { x0: 595, y0: top, x1: 799, y1: bottom, count: 350, color: '#1a1a1a', seed: 22, maxR: 1.3 })

  const b = AOA.bars
  const rows: { key: 'move' | 'range' | 'attack' | 'defense'; label: string; value: number }[] = [
    { key: 'move', label: 'MOVE', value: d.move },
    { key: 'range', label: 'RANGE', value: d.range },
    { key: 'attack', label: 'ATTACK', value: d.attack },
    { key: 'defense', label: 'DEFENSE', value: d.defense },
  ]
  const y0 = master ? b.y0 : AOA.basic.bars.y0
  const bh = master ? b.h : AOA.basic.bars.h
  ctx.textBaseline = 'alphabetic'
  rows.forEach((r, i) => {
    const y = y0 + i * b.pitch
    ctx.fillStyle = STAT_COLORS[r.key]
    ctx.fillRect(b.x, y, b.w, bh)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(b.x, y, b.w, bh / 2)
    ctx.fillStyle = '#ffffff'
    ctx.font = font(500, 23, FONT_COND)
    ctx.textAlign = 'left'
    drawSpaced(ctx, r.label, b.labelX, y + bh * 0.72, 0.4, 'left')
    ctx.font = font(600, 25, FONT_COND)
    ctx.textAlign = 'center'
    ctx.fillText(String(r.value), b.valueX, y + bh * 0.74)
  })

  if (master) {
    splat(ctx, pq.cx, 504, 19, STAT_COLORS.life, 99)
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.font = font(700, 27, FONT_COND)
    ctx.fillText(String(d.life), pq.cx, 514)
    ctx.font = font(600, 30, FONT_COND)
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 2
    ctx.fillText(String(d.points), pq.cx, 733)
    ctx.shadowColor = 'transparent'
    ctx.font = font(400, 15, FONT_BODY)
    ctx.fillText('Points', pq.cx, 753)
  }
  ctx.restore()
}

function drawSquadCount(ctx: CanvasRenderingContext2D, d: CardDesign): void {
  // official cards do not print a figure count (the hit-zone silhouettes show it);
  // a small credit line at the bottom is the only optional extra text.
  if (!d.footer.credit) return
  ctx.save()
  ctx.fillStyle = 'rgba(40,35,30,0.85)'
  ctx.font = font(500, 10.5, FONT_COND)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  ctx.fillText(d.footer.credit, 768, 880)
  ctx.restore()
}
