/// <reference lib="webworker" />
// Decodes HEIC/HEIF files with a WASM build of libheif, isolated in a worker so
// a bad file can only ever kill this worker, never the app.
import { heicTo } from 'heic-to'

interface Req {
  id: number
  blob: Blob
}

self.addEventListener('message', async (ev: MessageEvent<Req>) => {
  const { id, blob } = ev.data
  try {
    const bitmap = await heicTo({ blob, type: 'bitmap' })
    ;(self as unknown as Worker).postMessage({ id, bitmap }, [bitmap])
  } catch (err) {
    const e = err as { message?: string } | null
    ;(self as unknown as Worker).postMessage({ id, error: e?.message || String(err) })
  }
})
