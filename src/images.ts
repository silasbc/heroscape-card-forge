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
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
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
  const img = await blobToImage(file)
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1 && file.type === 'image/png') return file
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return canvasToBlob(c, 'image/png')
}
