/// <reference lib="webworker" />
// Web worker that runs a salient-object segmentation model with onnxruntime-web.
// Receives a normalised 1024x1024 RGBA buffer, returns a 1024x1024 matte.
import * as ort from 'onnxruntime-web/webgpu'

export type ModelKey = 'isnet' | 'birefnet'

interface ModelSpec {
  url: string
  bytes: number
  mean: [number, number, number]
  std: [number, number, number]
  sigmoid: boolean
}

const ORT_VERSION = '1.29.0'
const SIZE = 1024
const HF = 'https://huggingface.co/'

const SPECS: Record<string, ModelSpec> = {
  'isnet-fp16': {
    url: HF + 'onnx-community/ISNet-ONNX/resolve/main/onnx/model_fp16.onnx',
    bytes: 88_100_000,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
    sigmoid: false,
  },
  'isnet-int8': {
    url: HF + 'onnx-community/ISNet-ONNX/resolve/main/onnx/model_quantized.onnx',
    bytes: 44_300_000,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
    sigmoid: false,
  },
  'birefnet-fp16': {
    url: HF + 'onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model_fp16.onnx',
    bytes: 114_500_000,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    sigmoid: true,
  },
  'birefnet-fp32': {
    url: HF + 'onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx',
    bytes: 224_000_000,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    sigmoid: true,
  },
}

type Msg =
  | { type: 'run'; id: number; model: ModelKey; rgba: Uint8ClampedArray; preferGpu: boolean }
  | { type: 'ping' }

interface Session {
  key: string
  session: ort.InferenceSession
  spec: ModelSpec
  device: 'webgpu' | 'wasm'
}

let current: Session | null = null
let webgpuOk: boolean | null = null

// The WebAssembly runtime is bundled with the app (same origin), so no wasmPaths override.
void ORT_VERSION

function post(msg: unknown, transfer?: Transferable[]) {
  ;(self as unknown as Worker).postMessage(msg, transfer ?? [])
}

async function hasWebGPU(): Promise<boolean> {
  if (webgpuOk !== null) return webgpuOk
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (!gpu) return (webgpuOk = false)
    const adapter = await gpu.requestAdapter()
    webgpuOk = !!adapter
  } catch {
    webgpuOk = false
  }
  return webgpuOk
}

async function fetchModel(spec: ModelSpec, id: number): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try {
    cache = await caches.open('card-forge-models-v1')
    const hit = await cache.match(spec.url)
    if (hit) {
      post({ type: 'progress', id, stage: 'download', loaded: spec.bytes, total: spec.bytes, cached: true })
      return hit.arrayBuffer()
    }
  } catch {
    cache = null
  }
  const res = await fetch(spec.url, { mode: 'cors' })
  if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || spec.bytes
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  let lastPost = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    const now = Date.now()
    if (now - lastPost > 120) {
      lastPost = now
      post({ type: 'progress', id, stage: 'download', loaded, total })
    }
  }
  const buf = new Uint8Array(loaded)
  let p = 0
  for (const c of chunks) {
    buf.set(c, p)
    p += c.length
  }
  post({ type: 'progress', id, stage: 'download', loaded, total: loaded })
  if (cache) {
    try {
      await cache.put(spec.url, new Response(buf.slice().buffer, { headers: { 'Content-Type': 'application/octet-stream' } }))
    } catch (err) {
      console.warn('model cache put failed', err)
    }
  }
  return buf.buffer
}

async function getSession(model: ModelKey, preferGpu: boolean, id: number): Promise<Session> {
  const gpu = preferGpu && (await hasWebGPU())
  const attempts: { key: string; device: 'webgpu' | 'wasm' }[] = []
  if (model === 'birefnet') {
    if (gpu) attempts.push({ key: 'birefnet-fp16', device: 'webgpu' })
    attempts.push({ key: 'birefnet-fp32', device: 'wasm' })
  } else {
    if (gpu) attempts.push({ key: 'isnet-fp16', device: 'webgpu' })
    attempts.push({ key: 'isnet-int8', device: 'wasm' })
  }
  let lastErr: unknown = null
  for (const a of attempts) {
    if (current && current.key === a.key && current.device === a.device) return current
    try {
      const spec = SPECS[a.key]
      const buf = await fetchModel(spec, id)
      post({ type: 'progress', id, stage: 'init', device: a.device })
      const session = await ort.InferenceSession.create(buf, {
        executionProviders: [a.device],
        graphOptimizationLevel: 'all',
      })
      current = { key: a.key, session, spec, device: a.device }
      return current
    } catch (err) {
      console.warn('session create failed', a, err)
      lastErr = err
      if (a.device === 'webgpu') webgpuOk = false
    }
  }
  throw lastErr ?? new Error('no execution provider available')
}

async function run(msg: Extract<Msg, { type: 'run' }>) {
  const { id } = msg
  try {
    const s = await getSession(msg.model, msg.preferGpu, id)
    const { mean, std } = s.spec
    const n = SIZE * SIZE
    const input = new Float32Array(3 * n)
    const rgba = msg.rgba
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      input[i] = (rgba[p] / 255 - mean[0]) / std[0]
      input[i + n] = (rgba[p + 1] / 255 - mean[1]) / std[1]
      input[i + 2 * n] = (rgba[p + 2] / 255 - mean[2]) / std[2]
    }
    post({ type: 'progress', id, stage: 'run', device: s.device })
    const tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE])
    const feeds: Record<string, ort.Tensor> = { [s.session.inputNames[0]]: tensor }
    const t0 = performance.now()
    const out = await s.session.run(feeds)
    const first = out[s.session.outputNames[0]]
    const raw = first.data as Float32Array | Uint16Array
    const matte = new Float32Array(n)
    let mn = Infinity,
      mx = -Infinity
    for (let i = 0; i < n; i++) {
      let v = Number(raw[i])
      if (s.spec.sigmoid) v = 1 / (1 + Math.exp(-v))
      matte[i] = v
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    const range = mx - mn || 1
    for (let i = 0; i < n; i++) matte[i] = (matte[i] - mn) / range
    post({ type: 'done', id, matte, device: s.device, ms: performance.now() - t0 }, [matte.buffer])
  } catch (err) {
    post({ type: 'error', id, message: (err as Error)?.message ?? String(err) })
  }
}

self.addEventListener('message', (ev: MessageEvent<Msg>) => {
  const msg = ev.data
  if (msg.type === 'run') void run(msg)
  else if (msg.type === 'ping') post({ type: 'pong', isolated: (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated ?? false })
})
