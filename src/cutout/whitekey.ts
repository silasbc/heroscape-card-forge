// Fast background removal for photos shot on a plain backdrop: flood-fills the
// background colour in from the image border, then feathers and de-fringes.

export interface KeyOptions {
  /** 0..100, how far a pixel may stray from the backdrop colour */
  tolerance: number
  /** edge softness in pixels */
  feather: number
  /** shrink the cutout by this many pixels to kill halos */
  erode: number
}

export function estimateBackground(img: ImageData): [number, number, number] {
  const { width: w, height: h, data } = img
  const rs: number[] = [],
    gs: number[] = [],
    bs: number[] = []
  const push = (i: number) => {
    rs.push(data[i])
    gs.push(data[i + 1])
    bs.push(data[i + 2])
  }
  const step = Math.max(1, Math.floor((w + h) / 400))
  for (let x = 0; x < w; x += step) {
    push((0 * w + x) * 4)
    push(((h - 1) * w + x) * 4)
  }
  for (let y = 0; y < h; y += step) {
    push((y * w + 0) * 4)
    push((y * w + (w - 1)) * 4)
  }
  const med = (a: number[]) => {
    const s = [...a].sort((p, q) => p - q)
    return s[Math.floor(s.length / 2)]
  }
  return [med(rs), med(gs), med(bs)]
}

export function keyBackground(src: ImageData, o: KeyOptions): ImageData {
  const { width: w, height: h } = src
  const data = src.data
  const [br, bg, bb] = estimateBackground(src)
  const thr = 12 + (o.tolerance / 100) * 150
  const thr2 = thr * thr
  const n = w * h
  const isBg = new Uint8Array(n)
  const queue = new Int32Array(n)
  let qh = 0,
    qt = 0
  const dist2 = (i: number) => {
    const p = i * 4
    const dr = data[p] - br,
      dg = data[p + 1] - bg,
      db = data[p + 2] - bb
    return dr * dr + dg * dg + db * db
  }
  const seed = (i: number) => {
    if (!isBg[i] && dist2(i) <= thr2) {
      isBg[i] = 1
      queue[qt++] = i
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  while (qh < qt) {
    const i = queue[qh++]
    const x = i % w
    const y = (i - x) / w
    if (x > 0) seed(i - 1)
    if (x < w - 1) seed(i + 1)
    if (y > 0) seed(i - w)
    if (y < h - 1) seed(i + w)
  }

  // foreground coverage as float, then erode + blur for soft edges
  let cov: Float32Array = new Float32Array(n)
  for (let i = 0; i < n; i++) cov[i] = isBg[i] ? 0 : 1
  if (o.erode > 0) cov = minFilter(cov, w, h, Math.round(o.erode))
  if (o.feather > 0) cov = boxBlur(cov, w, h, Math.max(1, Math.round(o.feather)))

  const out = new ImageData(w, h)
  const od = out.data
  for (let i = 0; i < n; i++) {
    const p = i * 4
    const a = cov[i]
    if (a <= 0.002) {
      od[p] = data[p]
      od[p + 1] = data[p + 1]
      od[p + 2] = data[p + 2]
      od[p + 3] = 0
      continue
    }
    if (a >= 0.998) {
      od[p] = data[p]
      od[p + 1] = data[p + 1]
      od[p + 2] = data[p + 2]
      od[p + 3] = 255
      continue
    }
    // de-fringe: remove the backdrop colour's contribution from edge pixels
    const inv = 1 - a
    od[p] = clamp((data[p] - inv * br) / a)
    od[p + 1] = clamp((data[p + 1] - inv * bg) / a)
    od[p + 2] = clamp((data[p + 2] - inv * bb) / a)
    od[p + 3] = Math.round(a * 255)
  }
  return out
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const div = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / div
      const add = Math.min(w - 1, x + r + 1)
      const sub = Math.max(0, x - r)
      acc += src[row + add] - src[row + sub]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / div
      const add = Math.min(h - 1, y + r + 1)
      const sub = Math.max(0, y - r)
      acc += tmp[add * w + x] - tmp[sub * w + x]
    }
  }
  return out
}

export function minFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 1
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k))
        const v = src[y * w + xx]
        if (v < m) m = v
      }
      tmp[y * w + x] = m
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k))
        const v = tmp[yy * w + x]
        if (v < m) m = v
      }
      out[y * w + x] = m
    }
  }
  return out
}

/** Post-process any alpha channel: threshold curve + feather + erode. */
export function refineAlpha(
  src: ImageData,
  o: { hardness: number; feather: number; erode: number },
): ImageData {
  const { width: w, height: h, data } = src
  const n = w * h
  let cov: Float32Array = new Float32Array(n)
  // hardness 0..1 pushes soft alphas toward 0/1
  const k = 1 + o.hardness * 6
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255
    cov[i] = 1 / (1 + Math.exp(-k * (a - 0.5) * 4))
  }
  // renormalise the logistic so 0->0 and 1->1
  const lo = 1 / (1 + Math.exp(k * 2)),
    hi = 1 / (1 + Math.exp(-k * 2))
  for (let i = 0; i < n; i++) cov[i] = Math.min(1, Math.max(0, (cov[i] - lo) / (hi - lo)))
  if (o.erode > 0) cov = minFilter(cov, w, h, Math.round(o.erode))
  if (o.feather > 0) cov = boxBlur(cov, w, h, Math.round(o.feather))
  const out = new ImageData(w, h)
  const od = out.data
  for (let i = 0; i < n; i++) {
    const p = i * 4
    od[p] = data[p]
    od[p + 1] = data[p + 1]
    od[p + 2] = data[p + 2]
    od[p + 3] = Math.round(cov[i] * 255)
  }
  return out
}

/** Crop an ImageData to its non-transparent bounding box (with padding). */
export function trimTransparent(src: ImageData, pad = 4): ImageData {
  const { width: w, height: h, data } = src
  let minx = w,
    miny = h,
    maxx = -1,
    maxy = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
      }
    }
  }
  if (maxx < 0) return src
  minx = Math.max(0, minx - pad)
  miny = Math.max(0, miny - pad)
  maxx = Math.min(w - 1, maxx + pad)
  maxy = Math.min(h - 1, maxy + pad)
  const cw = maxx - minx + 1,
    ch = maxy - miny + 1
  const out = new ImageData(cw, ch)
  for (let y = 0; y < ch; y++) {
    out.data.set(data.subarray(((miny + y) * w + minx) * 4, ((miny + y) * w + minx + cw) * 4), y * cw * 4)
  }
  return out
}

export function imageToImageData(img: HTMLImageElement | ImageBitmap | HTMLCanvasElement): ImageData {
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}

export function imageDataToCanvas(d: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = d.width
  c.height = d.height
  c.getContext('2d')!.putImageData(d, 0, 0)
  return c
}
