import { useEffect, useRef, useState } from 'react'
import type { CardDesign, HitZoneItem } from '../model'
import { defaultTarget } from '../model'
import type { Updater } from '../App'
import { getSilhouetteSync, type Silhouette } from '../cutout/silhouette'
import { addImage, canvasToBlob, getSync, loadImage, replaceImage } from '../images'
import { STAT_COLORS } from '../render/palette'

type HzTool = 'gray' | 'erase' | 'target'

/**
 * Paints the "cannot be targeted" grey areas onto a silhouette and positions
 * its green Target Point. Squads: pick which figure to edit. The paint mask
 * lives in the silhouette's (downscaled) source pixel grid so it survives
 * re-thresholding.
 */
export function HitZoneEditor({ card, update, onClose }: { card: CardDesign; update: Updater; onClose: () => void }) {
  const items = card.hitZone.items
  const [index, setIndex] = useState(0)
  const item: HitZoneItem | undefined = items[Math.min(index, items.length - 1)]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement | null>(null)
  const [sil, setSil] = useState<Silhouette | undefined>(undefined)
  const [tool, setTool] = useState<HzTool>('gray')
  const [brush, setBrush] = useState(18)
  const [dirty, setDirty] = useState(false)
  const [tick, setTick] = useState(0)
  const painting = useRef(false)
  const lastPt = useRef<{ x: number; y: number } | null>(null)

  const patchItem = (i: number, patch: Partial<HitZoneItem>) =>
    update((c) => ({ ...c, hitZone: { ...c.hitZone, items: c.hitZone.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) } }))

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
    const trim = card.hitZone.trimBottom
    if (trim > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, h * (1 - trim), w, h * trim)
    }
    const t = item?.target
    if (t) {
      const tx = w * t.x
      const ty = h * (t.y * (1 - trim))
      ctx.beginPath()
      ctx.arc(tx, ty, Math.max(5, (t.r / 304) * h * 2.2), 0, Math.PI * 2)
      ctx.fillStyle = STAT_COLORS.target
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'
      ctx.stroke()
    }
  }, [sil, tick, item?.target, card.hitZone.trimBottom])

  const toMask = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }
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

  const placeTarget = (fx: number, fy: number) => {
    if (!item) return
    const trim = card.hitZone.trimBottom
    patchItem(index, { target: { r: item.target?.r ?? defaultTarget().r, x: clamp01(fx), y: clamp01(fy / Math.max(0.05, 1 - trim)) } })
  }

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { fx, fy } = toMask(e)
    try {
      canvasRef.current!.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no active pointer */
    }
    painting.current = true
    if (tool === 'target') {
      placeTarget(fx, fy)
      return
    }
    lastPt.current = null
    paintAt(fx, fy)
    setTick((t) => t + 1)
    setDirty(true)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return
    const { fx, fy } = toMask(e)
    if (tool === 'target') {
      placeTarget(fx, fy)
      return
    }
    paintAt(fx, fy)
    setTick((t) => t + 1)
  }
  const onUp = () => {
    painting.current = false
    lastPt.current = null
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
    // same grey paint and target for every figure that uses this cutout
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
            j !== index && it.imageId === src.imageId ? { ...it, paintImageId: src.paintImageId, target: src.target ? { ...src.target } : null } : it,
          ),
        },
      }
    })
  }

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
                  <span className="muted tiny">Figure:</span>
                  <div className="seg">
                    {items.map((_, i) => (
                      <button key={i} className={i === index ? 'on' : ''} onClick={() => void switchTo(i)}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button className="btn small" onClick={() => void copyToAll()} title="Apply this figure's grey paint and dot to the other silhouettes made from the same cutout">
                    Copy to matching figures
                  </button>
                </div>
              )}
              <div className="hzTools">
                <div className="seg">
                  <button className={tool === 'gray' ? 'on' : ''} onClick={() => setTool('gray')}>
                    Paint grey (not targetable)
                  </button>
                  <button className={tool === 'erase' ? 'on' : ''} onClick={() => setTool('erase')}>
                    Erase (back to red)
                  </button>
                  <button className={tool === 'target' ? 'on' : ''} onClick={() => setTool('target')}>
                    Place target dot
                  </button>
                </div>
                <label className="field" style={{ width: 160 }}>
                  <span>
                    Brush <b>{brush}</b>
                  </span>
                  <input type="range" min={4} max={60} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                </label>
                <button className="btn small" onClick={clearPaint}>
                  Clear grey
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!item.target}
                    onChange={(e) => patchItem(index, { target: e.target.checked ? defaultTarget() : null })}
                  />
                  Dot
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <canvas ref={canvasRef} className="hzCanvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
              </div>
              <p className="muted tiny" style={{ margin: 0 }}>
                On official cards the whole figure is red except wings, weapons, capes and mounts' wings, which are grey. Each figure's green Target Point normally sits on the head.
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
