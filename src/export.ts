// Export: print-resolution PNG (with the design embedded as a save file),
// JSON bundles, PDF print sheets, and import of all of the above.
import { jsPDF } from 'jspdf'
import type { CardDesign, Side } from './model'
import { imageIdsOf, newId, normalizeCard } from './model'
import { getImage, putImage, saveCard } from './storage'
import { blobToImage, canvasToBlob } from './images'
import { blobToBytes, insertChunks, physChunk, readTextChunk, textChunk } from './png'
import { cardInches, cardUnits, ensureAssets, renderToCanvas } from './render'
import { CARD_H, CARD_W, OUTLINE } from './geometry'

export const META_KEY = 'heroscape-card-forge'

export interface Bundle {
  app: typeof META_KEY
  version: 1
  cards: CardDesign[]
  images: Record<string, string> // id -> data URL
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return res.blob()
}

export async function makeBundle(cards: CardDesign[]): Promise<Bundle> {
  const images: Record<string, string> = {}
  for (const c of cards) {
    for (const id of imageIdsOf(c)) {
      if (images[id]) continue
      const blob = await getImage(id)
      if (blob) images[id] = await blobToDataUrl(blob)
    }
  }
  return { app: META_KEY, version: 1, cards, images }
}

export function slug(s: string): string {
  return (s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'card'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 2000)
}

/** Render one side to a PNG blob at the given DPI, with pHYs and embedded design. */
export async function exportPng(d: CardDesign, side: Side, dpi = 300, embed = true, background: string | null = null): Promise<Blob> {
  await ensureAssets(d, [side])
  const inches = cardInches(d.style)
  const canvas = renderToCanvas(d, side, Math.round(inches.w * dpi), undefined, background)
  const raw = await canvasToBlob(canvas, 'image/png')
  const bytes = await blobToBytes(raw)
  const chunks = [physChunk(dpi)]
  if (embed) {
    const bundle = await makeBundle([d])
    chunks.push(textChunk(META_KEY, JSON.stringify(bundle)))
  }
  return new Blob([insertChunks(bytes, chunks) as BlobPart], { type: 'image/png' })
}

export async function exportJson(cards: CardDesign[]): Promise<Blob> {
  const bundle = await makeBundle(cards)
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' })
}

/** Parse a PNG-with-metadata or JSON bundle. Returns the cards it contained (not yet saved). */
export async function parseImport(file: Blob): Promise<Bundle | null> {
  try {
    if (file.type === 'application/json' || (file as File).name?.endsWith('.json')) {
      const text = await file.text()
      const b = JSON.parse(text) as Bundle
      if (b && b.app === META_KEY && Array.isArray(b.cards)) return b
      return null
    }
    const bytes = await blobToBytes(file)
    const txt = readTextChunk(bytes, META_KEY)
    if (!txt) return null
    const b = JSON.parse(txt) as Bundle
    if (b && b.app === META_KEY && Array.isArray(b.cards)) return b
    return null
  } catch (err) {
    console.warn('import parse failed', err)
    return null
  }
}

/** Store a bundle's images (with fresh ids) and cards. Returns the saved cards. */
export async function importBundle(b: Bundle): Promise<CardDesign[]> {
  const idMap = new Map<string, string>()
  for (const [oldId, url] of Object.entries(b.images ?? {})) {
    const nid = newId()
    idMap.set(oldId, nid)
    await putImage(nid, await dataUrlToBlob(url))
  }
  const remap = (id?: string) => (id ? idMap.get(id) ?? id : id)
  const out: CardDesign[] = []
  for (const raw of b.cards) {
    const c = normalizeCard(raw)
    c.id = newId()
    c.createdAt = Date.now()
    c.updatedAt = Date.now()
    c.portrait.layers = c.portrait.layers.map((l) => ({ ...l, id: newId(), imageId: remap(l.imageId)! }))
    c.basicPortrait.layers = c.basicPortrait.layers.map((l) => ({ ...l, id: newId(), imageId: remap(l.imageId)! }))
    c.portrait.backdrop.imageId = remap(c.portrait.backdrop.imageId)
    c.basicPortrait.backdrop.imageId = remap(c.basicPortrait.backdrop.imageId)
    c.hitZone.items = c.hitZone.items.map((it) => ({ imageId: remap(it.imageId)! }))
    c.hitZone.paintImageId = remap(c.hitZone.paintImageId)
    c.customGeneral.emblemImageId = remap(c.customGeneral.emblemImageId)
    await saveCard(c)
    out.push(c)
  }
  return out
}

// ---------------------------------------------------------------- PDF

export interface PdfOptions {
  dpi: number
  sides: 'both' | 'master' | 'basic'
  cutGuides: boolean
  paper: 'letter' | 'a4'
}

/**
 * Print sheet: two cards per page at true size, Master pages followed by the
 * matching Basic pages so the sheet can be printed double sided (flip on the
 * long edge). Cards are centred horizontally so both sides line up.
 */
export async function exportPdf(cards: CardDesign[], o: PdfOptions, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const doc = new jsPDF({ unit: 'in', format: o.paper, orientation: 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const perPage = 2
  const pages: CardDesign[][] = []
  for (let i = 0; i < cards.length; i += perPage) pages.push(cards.slice(i, i + perPage))
  const sides: Side[] = o.sides === 'both' ? ['master', 'basic'] : [o.sides]
  let first = true
  let done = 0
  const total = pages.length * sides.length * perPage
  for (const group of pages) {
    for (const side of sides) {
      if (!first) doc.addPage()
      first = false
      // layout: stack vertically, centred
      const sizes = group.map((c) => cardInches(c.style))
      const gap = 0.3
      const totalH = sizes.reduce((a, s) => a + s.h, 0) + gap * (group.length - 1)
      let y = (pageH - totalH) / 2
      for (let i = 0; i < group.length; i++) {
        const c = group[i]
        const s = sizes[i]
        const x = (pageW - s.w) / 2
        await ensureAssets(c, [side])
        const canvas = renderToCanvas(c, side, Math.round(s.w * o.dpi), undefined, '#ffffff')
        const url = canvas.toDataURL('image/jpeg', 0.93)
        doc.addImage(url, 'JPEG', x, y, s.w, s.h, undefined, 'FAST')
        if (o.cutGuides) drawCutGuide(doc, c, x, y, s.w, s.h)
        y += s.h + gap
        done++
        onProgress?.(done, total)
      }
      // page label
      doc.setFontSize(7)
      doc.setTextColor(140)
      doc.text(`${side === 'master' ? 'Master' : 'Basic'} side · print at 100% (no scaling)`, 0.4, pageH - 0.3)
    }
  }
  return doc.output('blob')
}

function drawCutGuide(doc: jsPDF, c: CardDesign, x: number, y: number, w: number, h: number): void {
  const u = cardUnits(c.style)
  doc.setDrawColor(150)
  doc.setLineWidth(0.004)
  // classic blanks have a small margin around the die-cut; approximate it
  const pad = c.style === 'aoa' ? 0 : 0.005
  const pts = OUTLINE.map(([px, py]) => [x + pad * w + ((px / CARD_W) * w * (1 - 2 * pad)), y + pad * h + ((py / CARD_H) * h * (1 - 2 * pad))])
  void u
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    doc.line(x1, y1, x2, y2)
  }
}

/** Small thumbnail data URL for the gallery. */
export async function thumbnail(d: CardDesign, width = 320): Promise<string> {
  await ensureAssets(d, ['master'])
  const c = renderToCanvas(d, 'master', width)
  return c.toDataURL('image/png')
}

export { blobToImage }
