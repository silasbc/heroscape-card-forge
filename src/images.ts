// In-memory image cache backed by IndexedDB blobs. Renderers draw synchronously,
// so callers preload the ids they need and then read them with getSync().
import { getImage, putImage } from './storage'
import { newId } from './model'

const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement | null>>()
const listeners = new Set<() => void>()

export function onImagesChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() {
  listeners.forEach((fn) => fn())
}

export function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    const done = async () => {
      try {
        // make sure the pixels are decoded before the URL goes away (Safari)
        if (typeof img.decode === 'function') await img.decode()
      } catch {
        /* fall through: a load event already fired */
      }
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onload = () => void done()
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image format could not be decoded'))
    }
    img.src = url
  })
}

export function looksLikeHeic(file: Blob): boolean {
  const name = ((file as File).name ?? '').toLowerCase()
  return /heic|heif/.test(file.type) || /\.(heic|heif)$/.test(name)
}

export interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  /** the original file when the browser decoded it directly */
  original?: Blob
}

/** Decode any upload, converting iPhone HEIC/HEIF photos in the browser when the browser cannot. */
export async function decodeUpload(file: Blob): Promise<Decoded> {
  try {
    const img = await blobToImage(file)
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, original: file }
  } catch (err) {
    // Chrome, Edge and Firefox cannot decode HEIC; use a WASM build of libheif
    // for anything HEIC-like or of unknown type.
    if (!looksLikeHeic(file) && file.type && file.type !== 'application/octet-stream') throw err
    const bitmap = await convertHeic(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
}

const HEIC_TIMEOUT_MS = 120_000

/** Run the HEIC decoder in a throwaway worker with a timeout; fall back to the main thread. */
async function convertHeic(file: Blob): Promise<ImageBitmap> {
  if (typeof Worker !== 'undefined') {
    try {
      return await convertHeicInWorker(file)
    } catch (err) {
      const msg = (err as Error)?.message || String(err)
      if (!/worker unavailable/.test(msg)) throw new Error('HEIC conversion failed: ' + msg)
    }
  }
  const { heicTo } = await import('heic-to')
  try {
    return await heicTo({ blob: file, type: 'bitmap' })
  } catch (err) {
    const e = err as { message?: string } | null
    throw new Error('HEIC conversion failed: ' + (e?.message || String(err)))
  }
}

function convertHeicInWorker(file: Blob): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./cutout/heicWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      reject(new Error('worker unavailable'))
      return
    }
    const id = Date.now()
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('the photo took too long to convert; try exporting it as a JPG'))
    }, HEIC_TIMEOUT_MS)
    worker.onmessage = (ev: MessageEvent<{ id: number; bitmap?: ImageBitmap; error?: string }>) => {
      if (ev.data.id !== id) return
      window.clearTimeout(timer)
      worker.terminate()
      if (ev.data.bitmap) resolve(ev.data.bitmap)
      else reject(new Error(ev.data.error || 'unknown decoder error'))
    }
    worker.onerror = (e) => {
      window.clearTimeout(timer)
      worker.terminate()
      reject(new Error('worker unavailable: ' + (e.message || 'failed to start')))
    }
    worker.postMessage({ id, blob: file })
  })
}

export function urlToImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e)
    img.src = url
  })
}

export function getSync(id: string | undefined): HTMLImageElement | undefined {
  if (!id) return undefined
  return cache.get(id)
}

export function loadImage(id: string): Promise<HTMLImageElement | null> {
  const hit = cache.get(id)
  if (hit) return Promise.resolve(hit)
  const p = pending.get(id)
  if (p) return p
  const task = (async () => {
    try {
      const blob = await getImage(id)
      if (!blob) return null
      const img = await blobToImage(blob)
      cache.set(id, img)
      notify()
      return img
    } catch (err) {
      console.warn('image load failed', id, err)
      return null
    } finally {
      pending.delete(id)
    }
  })()
  pending.set(id, task)
  return task
}

export async function preload(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => loadImage(id)))
}

/** Store a new image blob and cache it. Returns the new id. */
export async function addImage(blob: Blob, id = newId()): Promise<string> {
  await putImage(id, blob)
  const img = await blobToImage(blob)
  cache.set(id, img)
  notify()
  return id
}

/** Replace an existing image's pixels (used by the hit-zone painter). */
export async function replaceImage(id: string, blob: Blob): Promise<void> {
  await putImage(id, blob)
  const img = await blobToImage(blob)
  cache.set(id, img)
  notify()
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  )
}

/** Static app assets (symbols, classic blanks) cached by URL. */
const assetCache = new Map<string, HTMLImageElement>()
const assetPending = new Map<string, Promise<HTMLImageElement | null>>()

export function getAssetSync(path: string): HTMLImageElement | undefined {
  return assetCache.get(path)
}

export function loadAsset(path: string): Promise<HTMLImageElement | null> {
  const hit = assetCache.get(path)
  if (hit) return Promise.resolve(hit)
  const p = assetPending.get(path)
  if (p) return p
  const task = (async () => {
    try {
      const img = await urlToImage(import.meta.env.BASE_URL + path)
      assetCache.set(path, img)
      notify()
      return img
    } catch (err) {
      console.warn('asset failed', path, err)
      return null
    } finally {
      assetPending.delete(path)
    }
  })()
  assetPending.set(path, task)
  return task
}

/** Downscale very large uploads so previews stay snappy and exports stay sane. */
export async function normalizeUpload(file: Blob, maxSide = 2400): Promise<Blob> {
  const d = await decodeUpload(file)
  const scale = Math.min(1, maxSide / Math.max(d.width, d.height))
  if (scale === 1 && d.original && d.original.type === 'image/png') return d.original
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(d.width * scale))
  c.height = Math.max(1, Math.round(d.height * scale))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(d.source, 0, 0, c.width, c.height)
  return canvasToBlob(c, 'image/png')
}
