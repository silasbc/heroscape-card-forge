import { useEffect, useRef, useState } from 'react'
import type { CardDesign, HitZoneItem, TargetPoint } from '../model'
import { defaultTarget } from '../model'
import type { Updater } from '../App'
import { getSilhouetteSync, type Silhouette } from '../cutout/silhouette'
import { addImage, canvasToBlob, getSync, loadImage, replaceImage } from '../images'
import { STAT_COLORS } from '../render/palette'

type HzTool = 'gray' | 'erase' | 'dot' | 'removeDot'

/**
 * Paints the "cannot be targeted" grey areas onto a silhouette and places its
 * green Target Points. A silhouette may carry several dots (one per figure it
 * shows, e.g. a whole squad in one cutout). Squads with one silhouette per
 * figure pick which figure to edit. The paint mask lives in the silhouette's
 * (downscaled) source pixel grid so it survives re-thresholding.
 */
export function HitZoneEditor({ card, update, onClose }: { card: CardDesign; update: Updater; onClose: () => void }) {
  const items = card.hitZone.items
  const [index, setIndex] = useState(0)
  const item: HitZoneItem | undefined = items[Math.min(index, items.length - 1)]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const [sil, setSil] = useState<Silhouette | undefined>(undefined)
  const [tool, setTool] = useState<HzTool>('dot')
  const [brush, setBrush] = useState(18)
  const [dirty, setDirty] = useState(false)
  const [tick, setTick] = useState(0)
  const painting = useRef(false)
  const lastPt = useRef<{ x: number; y: number } | null>(null)
  const dragDot = useRef<number | null>(null)

  const patchItem = (i: number, patch: Partial<HitZoneItem>) =>
    update((c) => ({ ...c, hitZone: { ...c.hitZone, items: c.hitZone.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } }))
  const setTargets = (fn: (t: TargetPoint[]) => TargetPoint[]) =>
    update((c) => ({ ...c, hitZone: { ...c.hitZone, items: c.hitZone.items.map((it, j) => (j === index ? { ...it, targets: fn(it.targets) } : it)) } }))

  // load silhouette + existing paint for the selected figure
  useEffect(() => {
    if (!item) return
    let alive = true
    setSil(undefined)
    maskRef.current = null
    setDirty(false)
    ;(async () => {
      await loadImage(item.imageId)
      if (item.paintImageId) await loadImage(item.paintImageId)
      if (!alive) return
      const s = getSilhouetteSync(item.imageId, card.hitZone.threshold)
      setSil(s)
      if (s) {
        const m = document.createElement('canvas')
        m.width = s.srcW
        m.height = s.srcH
        const paint = getSync(item.paintImageId)
        if (paint) m.getContext('2d')!.drawImage(paint, 0, 0, s.srcW, s.srcH)
        maskRef.current = m
        setTick((t) => t + 1)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.imageId, item?.paintImageId, card.hitZone.threshold, index])

  const trim = card.hitZone.trimBottom
  const dotRadiusPx = (h: number, t: TargetPoint) => Math.max(5, (t.r / 304) * h * 2.2)

  // draw editor canvas
  useEffect(() => {
    const c = canvasRef.current
    if (!c || !sil) return
    const maxW = Math.min(520, window.innerWidth - 60)
    const maxH = Math.min(520, window.innerHeight * 0.5)
    const s = Math.min(maxW / sil.canvas.width, maxH / sil.canvas.height)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.round(sil.canvas.width * s)
    const h = Math.round(sil.canvas.height * s)
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    c.style.width = w + 'px'
    c.style.height = h + 'px'
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const red = document.createElement('canvas')
    red.width = sil.canvas.width
    red.height = sil.canvas.height
    const rctx = red.getContext('2d')!
    rctx.drawImage(sil.mask, 0, 0)
    rctx.globalCompositeOperation = 'source-in'
    rctx.fillStyle = STAT_COLORS.hitZoneRed
    rctx.fillRect(0, 0, red.width, red.height)
    if (maskRef.current) {
      rctx.globalCompositeOperation = 'source-atop'
      const g = document.createElement('canvas')
      g.width = red.width
      g.height = red.height
      const gctx = g.getContext('2d')!
      gctx.drawImage(maskRef.current, -sil.offsetX, -sil.offsetY)
      gctx.globalCompositeOperation = 'source-in'
      gctx.fillStyle = STAT_COLORS.hitZoneGray
      gctx.fillRect(0, 0, g.width, g.height)
      rctx.drawImage(g, 0, 0)
    }
    ctx.drawImage(red, 0, 0, w, h)
    if (trim > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, h * (1 - trim), w, h * trim)
    }
    for (const t of item?.targets ?? []) {
      const tx = w * t.x
      const ty = h * (t.y * (1 - trim))
      ctx.beginPath()
      ctx.arc(tx, ty, dotRadiusPx(h, t), 0, Math.PI * 2)
      ctx.fillStyle = STAT_COLORS.target
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.stroke()
    }
  }, [sil, tick, item?.targets, trim])

  const toFrac = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, w: r.width, h: r.height }
  }

  /** index of the dot under the pointer, or -1 */
  const dotAt = (fx: number, fy: number, w: number, h: number) => {
    const targets = item?.targets ?? []
    for (let k = targets.length - 1; k >= 0; k--) {
      const t = targets[k]
      const tx = w * t.x
      const ty = h * (t.y * (1 - trim))
      const r = Math.max(dotRadiusPx(h, t) * 1.8, 14)
      if (Math.hypot(fx * w - tx, fy * h - ty) <= r) return k
    }
    return -1
  }

  const paintAt = (fx: number, fy: number) => {
    if (!sil || !maskRef.current) return
    const m = maskRef.current.getContext('2d')!
    const x = sil.offsetX + fx * sil.canvas.width
    const y = sil.offsetY + fy * sil.canvas.height
    const r = (brush / 520) * Math.max(sil.canvas.width, sil.canvas.height)
    m.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
    m.fillStyle = '#ffffff'
    m.strokeStyle = '#ffffff'
    m.lineWidth = r * 2
    m.lineCap = 'round'
    if (lastPt.current) {
      m.beginPath()
      m.moveTo(lastPt.current.x, lastPt.current.y)
      m.lineTo(x, y)
      m.stroke()
    } else {
      m.beginPath()
      m.arc(x, y, r, 0, Math.PI * 2)
      m.fill()
    }
    lastPt.current = { x, y }
  }

  const moveDot = (k: number, fx: number, fy: number) =>
    setTargets((ts) => ts.map((t, i) => (i === k ? { ...t, x: clamp01(fx), y: clamp01(fy / Math.max(0.05, 1 - trim)) } : t)))

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { fx, fy, w, h } = toFrac(e)
    try {
      canvasRef.current!.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no active pointer */
    }
    if (tool === 'dot') {
      const k = dotAt(fx, fy, w, h)
      if (k >= 0) {
        dragDot.current = k
        painting.current = true
      } else {
        // new dot where you tapped
        const r = item?.targets[0]?.r ?? defaultTarget().r
        setTargets((ts) => [...ts, { r, x: clamp01(fx), y: clamp01(fy / Math.max(0.05, 1 - trim)) }])
        dragDot.current = (item?.targets.length ?? 0)
        painting.current = true
      }
      return
    }
    if (tool === 'removeDot') {
      const k = dotAt(fx, fy, w, h)
      if (k >= 0) setTargets((ts) => ts.filter((_, i) => i !== k))
      return
    }
    painting.current = true
    lastPt.current = null
    paintAt(fx, fy)
    setTick((t) => t + 1)
    setDirty(true)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return
    const { fx, fy } = toFrac(e)
    if (tool === 'dot') {
      if (dragDot.current !== null) moveDot(dragDot.current, fx, fy)
      return
    }
    if (tool === 'removeDot') return
    paintAt(fx, fy)
    setTick((t) => t + 1)
  }
  const onUp = () => {
    painting.current = false
    lastPt.current = null
    dragDot.current = null
  }

  /** Persist the paint mask of the current figure. */
  const savePaint = async () => {
    if (!maskRef.current || !dirty || !item) return
    const blob = await canvasToBlob(maskRef.current, 'image/png')
    if (item.paintImageId) {
      await replaceImage(item.paintImageId, blob)
      update((c) => ({ ...c }))
    } else {
      const id = await addImage(blob)
      patchItem(index, { paintImageId: id })
    }
    setDirty(false)
  }

  const done = async () => {
    await savePaint()
    onClose()
  }

  const switchTo = async (i: number) => {
    await savePaint()
    setIndex(i)
  }

  const clearPaint = () => {
    if (!maskRef.current) return
    maskRef.current.getContext('2d')!.clearRect(0, 0, maskRef.current.width, maskRef.current.height)
    setDirty(true)
    setTick((t) => t + 1)
  }

  const copyToAll = async () => {
    if (!item) return
    await savePaint()
    update((c) => {
      const src = c.hitZone.items[index]
      if (!src) return c
      return {
        ...c,
        hitZone: {
          ...c.hitZone,
          items: c.hitZone.items.map((it, j) =>
            j !== index && it.imageId === src.imageId ? { ...it, paintImageId: src.paintImageId, targets: src.targets.map((t) => ({ ...t })) } : it,
          ),
        },
      }
    })
  }

  const dots = item?.targets.length ?? 0

  return (
    <div className="modalBack" onClick={done}>
      <div className="modal" style={{ width: 'min(700px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Hit zone{items.length > 1 ? ` · figure ${index + 1} of ${items.length}` : ''}</h2>
          <button className="btn small" onClick={done}>
            Done
          </button>
        </header>
        <div className="body">
          {!item ? (
            <p>Add a figure cutout first.</p>
          ) : (
            <>
              {items.length > 1 && (
                <div className="row">
                  <span className="muted tiny">Silhouette:</span>
                  <div className="seg">
                    {items.map((_, i) => (
                      <button key={i} className={i === index ? 'on' : ''} onClick={() => void switchTo(i)}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button className="btn small" onClick={() => void copyToAll()} title="Apply this silhouette's grey paint and dots to the others made from the same cutout">
                    Copy to matching silhouettes
                  </button>
                </div>
              )}
              <div className="hzTools">
                <div className="seg">
                  <button className={tool === 'dot' ? 'on' : ''} onClick={() => setTool('dot')}>
                    Dots: tap to add, drag to move
                  </button>
                  <button className={tool === 'removeDot' ? 'on' : ''} onClick={() => setTool('removeDot')}>
                    Remove a dot
                  </button>
                  <button className={tool === 'gray' ? 'on' : ''} onClick={() => setTool('gray')}>
                    Paint grey
                  </button>
                  <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}>
                    Erase grey
                  </button>
                </div>
                {(tool === 'gray' || tool === 'erase') && (
                  <>
                    <label className="field" style={{ width: 160 }}>
                      <span>
                        Brush <b>{brush}</b>
                      </span>
                      <input type="range" min={4} max={60} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                    </label>
                    <button className="btn small" onClick={clearPaint}>
                      Clear grey
                    </button>
                  </>
                )}
                {(tool === 'dot' || tool === 'removeDot') && (
                  <>
                    <span className="muted tiny">
                      {dots} dot{dots === 1 ? '' : 's'}
                    </span>
                    {dots > 0 && (
                      <button className="btn small" onClick={() => setTargets(() => [])}>
                        Remove all dots
                      </button>
                    )}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <canvas ref={canvasRef} className="hzCanvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              </div>
              <p className="muted tiny" style={{ margin: 0 }}>
                Put one green dot on each figure's head. Grey marks parts that cannot be targeted, like wings, weapons and capes. Everything else stays red as the hit zone.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
