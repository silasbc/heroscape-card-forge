// IndexedDB persistence via idb-keyval. Designs and images live in separate stores.
import { createStore, get, set, del, keys, entries } from 'idb-keyval'
import type { CardDesign } from './model'
import { imageIdsOf, normalizeCard } from './model'

const cardStore = createStore('heroscape-card-forge', 'cards')
const imageStore = createStore('heroscape-card-forge-images', 'images')
const metaStore = createStore('heroscape-card-forge-meta', 'meta')

export async function listCards(): Promise<CardDesign[]> {
  try {
    const all = await entries<string, unknown>(cardStore)
    return all
      .map(([, v]) => normalizeCard(v))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (err) {
    console.warn('listCards failed', err)
    return []
  }
}

export async function loadCard(id: string): Promise<CardDesign | null> {
  const v = await get(id, cardStore)
  return v ? normalizeCard(v) : null
}

export async function saveCard(d: CardDesign): Promise<void> {
  await set(d.id, d, cardStore)
}

export async function deleteCard(id: string): Promise<void> {
  await del(id, cardStore)
}

interface StoredBuffer {
  __buffer: true
  type: string
  data: ArrayBuffer
}

/** Images that could not be persisted stay usable for this session. */
const memoryImages = new Map<string, Blob>()
let storageWarned = false
const storageListeners = new Set<(msg: string) => void>()
export function onStorageWarning(fn: (msg: string) => void): () => void {
  storageListeners.add(fn)
  return () => storageListeners.delete(fn)
}
function warnStorage(msg: string) {
  if (storageWarned) return
  storageWarned = true
  storageListeners.forEach((fn) => fn(msg))
}

function describe(err: unknown): string {
  if (!err) return 'unknown storage error'
  const e = err as { name?: string; message?: string }
  return [e.name, e.message].filter(Boolean).join(': ') || String(err)
}

export async function putImage(id: string, blob: Blob): Promise<void> {
  memoryImages.set(id, blob)
  try {
    await set(id, blob, imageStore)
    return
  } catch (err) {
    console.warn('storing Blob failed, retrying as buffer', describe(err))
  }
  try {
    const stored: StoredBuffer = { __buffer: true, type: blob.type, data: await blob.arrayBuffer() }
    await set(id, stored, imageStore)
  } catch (err) {
    console.warn('storing image buffer failed', describe(err))
    warnStorage('This browser would not save the photo to its storage, so it will only last for this visit. Download the card as PNG to keep it.')
  }
}

export async function getImage(id: string): Promise<Blob | undefined> {
  try {
    const v = await get<Blob | StoredBuffer>(id, imageStore)
    if (v instanceof Blob) return v
    if (v && (v as StoredBuffer).__buffer) return new Blob([(v as StoredBuffer).data], { type: (v as StoredBuffer).type })
  } catch (err) {
    console.warn('reading image failed', describe(err))
  }
  return memoryImages.get(id)
}

export async function deleteImage(id: string): Promise<void> {
  await del(id, imageStore)
}

export async function allImageIds(): Promise<string[]> {
  return (await keys<string>(imageStore)) as string[]
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, metaStore)
  } catch {
    return undefined
  }
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  try {
    await set(key, value, metaStore)
  } catch {
    /* ignore */
  }
}

/** Ask the browser not to evict our data (Safari deletes idle storage after 7 days). */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* ignore */
  }
}

/** Set of image ids referenced by a list of cards. */
export function imageIdsFromCards(cards: CardDesign[]): Set<string> {
  const s = new Set<string>()
  for (const c of cards) for (const id of imageIdsOf(c)) s.add(id)
  return s
}

/** Remove images no card references any more. */
export async function garbageCollectImages(inUse: Set<string>): Promise<number> {
  let n = 0
  try {
    for (const id of await allImageIds()) {
      if (!inUse.has(id)) {
        await deleteImage(id)
        n++
      }
    }
  } catch {
    /* ignore */
  }
  return n
}
