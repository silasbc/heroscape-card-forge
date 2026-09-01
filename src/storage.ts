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

export async function putImage(id: string, blob: Blob): Promise<void> {
  await set(id, blob, imageStore)
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, imageStore)
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
