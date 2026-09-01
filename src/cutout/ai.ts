// Main-thread client for the ONNX cutout worker.
import type { ModelKey } from './ortWorker'

export type { ModelKey }

export interface CutoutProgress {
  stage: 'download' | 'init' | 'run' | 'compose'
  loaded?: number
  total?: number
  cached?: boolean
  device?: string
}

const SIZE = 1024
let worker: Worker | null = null
let seq = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./ortWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function warmUpWorker(): void {
  try {
    getWorker().postMessage({ type: 'ping' })
  } catch {
    /* ignore */
  }
}

export function aiAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

/**
 * Remove the background of an image with a neural matting model.
 * Returns an RGBA ImageData at the source resolution.
 */
export async function aiCutout(
  src: HTMLImageElement | HTMLCanvasElement,
  model: ModelKey,
  onProgress: (p: CutoutProgress) => void,
  preferGpu = true,
): Promise<ImageData> {
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  // model input: plain resize to 1024x1024 (as in the reference implementations)
  const small = document.createElement('canvas')
  small.width = SIZE
  small.height = SIZE
  const sctx = small.getContext('2d', { willReadFrequently: true })!
  sctx.imageSmoothingQuality = 'high'
  sctx.fillStyle = '#ffffff'
  sctx.fillRect(0, 0, SIZE, SIZE)
  sctx.drawImage(src, 0, 0, SIZE, SIZE)
  const rgba = sctx.getImageData(0, 0, SIZE, SIZE).data

  const id = ++seq
  const wk = getWorker()
  const matte = await new Promise<Float32Array>((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data
      if (!m || m.id !== id) return
      if (m.type === 'progress') onProgress({ stage: m.stage, loaded: m.loaded, total: m.total, cached: m.cached, device: m.device })
      else if (m.type === 'done') {
        cleanup()
        resolve(m.matte as Float32Array)
      } else if (m.type === 'error') {
        cleanup()
        reject(new Error(m.message))
      }
    }
    const onErr = (e: ErrorEvent) => {
      cleanup()
      reject(new Error(e.message || 'worker crashed'))
    }
    const cleanup = () => {
      wk.removeEventListener('message', onMsg)
      wk.removeEventListener('error', onErr)
    }
    wk.addEventListener('message', onMsg)
    wk.addEventListener('error', onErr)
    wk.postMessage({ type: 'run', id, model, rgba, preferGpu }, [rgba.buffer])
  })

  onProgress({ stage: 'compose' })
  // matte -> alpha canvas at 1024, upscale to source size, apply as alpha
  const alpha = new ImageData(SIZE, SIZE)
  for (let i = 0, p = 0; i < SIZE * SIZE; i++, p += 4) {
    const a = Math.round(Math.min(1, Math.max(0, matte[i])) * 255)
    alpha.data[p] = 255
    alpha.data[p + 1] = 255
    alpha.data[p + 2] = 255
    alpha.data[p + 3] = a
  }
  const ac = document.createElement('canvas')
  ac.width = SIZE
  ac.height = SIZE
  ac.getContext('2d')!.putImageData(alpha, 0, 0)

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d', { willReadFrequently: true })!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(src, 0, 0, w, h)
  octx.globalCompositeOperation = 'destination-in'
  octx.drawImage(ac, 0, 0, w, h)
  octx.globalCompositeOperation = 'source-over'
  return octx.getImageData(0, 0, w, h)
}
