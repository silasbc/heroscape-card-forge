// Minimal PNG chunk utilities: add a pHYs (DPI) chunk and a tEXt chunk that
// carries the card design so every exported PNG is also a save file.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

export function physChunk(dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254)
  const d = new Uint8Array(9)
  const dv = new DataView(d.buffer)
  dv.setUint32(0, ppm)
  dv.setUint32(4, ppm)
  d[8] = 1
  return chunk('pHYs', d)
}

/** tEXt chunk. Value is stored as Latin-1, so non-ASCII is JSON-escaped first. */
export function textChunk(key: string, value: string): Uint8Array {
  const latin = value.replace(/[^\x20-\x7e]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'))
  const bytes = new Uint8Array(key.length + 1 + latin.length)
  for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i)
  bytes[key.length] = 0
  for (let i = 0; i < latin.length; i++) bytes[key.length + 1 + i] = latin.charCodeAt(i)
  return chunk('tEXt', bytes)
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function isPng(bytes: Uint8Array): boolean {
  return SIG.every((b, i) => bytes[i] === b)
}

/** Insert chunks right after IHDR (pHYs must precede IDAT; tEXt may go anywhere). */
export function insertChunks(png: Uint8Array, chunks: Uint8Array[]): Uint8Array {
  if (!isPng(png)) throw new Error('not a PNG')
  const ihdrLen = new DataView(png.buffer, png.byteOffset).getUint32(8)
  const cut = 8 + 12 + ihdrLen
  // drop any existing pHYs so ours wins
  const rest = stripChunk(png.subarray(cut), 'pHYs')
  const total = cut + chunks.reduce((a, c) => a + c.length, 0) + rest.length
  const out = new Uint8Array(total)
  out.set(png.subarray(0, cut), 0)
  let p = cut
  for (const c of chunks) {
    out.set(c, p)
    p += c.length
  }
  out.set(rest, p)
  return out
}

function stripChunk(bytes: Uint8Array, type: string): Uint8Array {
  const parts: Uint8Array[] = []
  let p = 0
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (p + 8 <= bytes.length) {
    const len = dv.getUint32(p)
    const t = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7])
    const end = p + 12 + len
    if (t !== type) parts.push(bytes.subarray(p, end))
    p = end
  }
  const total = parts.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(total)
  let q = 0
  for (const part of parts) {
    out.set(part, q)
    q += part.length
  }
  return out
}

export function readTextChunk(png: Uint8Array, key: string): string | null {
  if (!isPng(png)) return null
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let p = 8
  while (p + 8 <= png.length) {
    const len = dv.getUint32(p)
    const t = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7])
    if (t === 'tEXt') {
      const data = png.subarray(p + 8, p + 8 + len)
      const z = data.indexOf(0)
      if (z > 0) {
        let k = ''
        for (let i = 0; i < z; i++) k += String.fromCharCode(data[i])
        if (k === key) {
          let v = ''
          for (let i = z + 1; i < data.length; i++) v += String.fromCharCode(data[i])
          return v.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        }
      }
    }
    if (t === 'IEND') break
    p += 12 + len
  }
  return null
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}
