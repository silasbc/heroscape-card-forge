import { useEffect, useRef, useState } from 'react'
import type { CardDesign, Side } from '../model'
import { splitBasicPortrait } from '../model'
import { cardUnits, ensureAssets, env, hzBoxFor, layerScaleFor, renderToCanvas } from '../render'
import { hitZoneSlots } from '../render/hitzone'
import { onImagesChanged } from '../images'
import type { Updater } from '../App'

export type Tool = 'none' | 'portrait' | 'hitzone'

interface Props {
  card: CardDesign
  side: Side
  tool: Tool
  activeLayer: string | null
  update: Updater
}

interface DragState {
  kind: 'layer' | 'hz' | 'target' | 'pinch'
  startX: number
  startY: number
  origX: number
  origY: number
  origScale: number
  pointers: Map<number, { x: number; y: number }>
  startDist: number
  slot?: { x: number; y: number; w: number; h: number }
  itemIndex?: number
}

export function Preview({ card, side, tool, activeLayer, update }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const drag = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)

  // re-render when images finish loading
  useEffect(() => onImagesChanged(() => setTick((t) => t + 1)), [])

  // draw
  useEffect(() => {
    let cancelled = false
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const draw = async () => {
      await ensureAssets(card, [side])
      if (cancelled) return
      const u = cardUnits(card.style)
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      // fit inside the wrapper
      const availW = Math.max(120, rect.width)
      const availH = Math.max(120, rect.height)
      let cssW = availW
      let cssH = (cssW * u.h) / u.w
      if (cssH > availH) {
        cssH = availH
        cssW = (cssH * u.w) / u.h
      }
      renderToCanvas(card, side, Math.round(cssW * dpr), canvas)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`
    }
    const raf = requestAnimationFrame(() => void draw())
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [card, side, tick])

  // redraw on resize
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const toUnits = (e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    const u = cardUnits(card.style)
    return { x: ((e.clientX - r.left) / r.width) * u.w, y: ((e.clientY - r.top) / r.height) * u.h, upp: u.w / r.width }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'none') return
    const c = canvasRef.current!
    try {
      c.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic events have no active pointer */
    }
    const p = toUnits(e)
    const d = drag.current
    if (d && d.pointers.size === 1) {
      // second finger: pinch
      d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const pts = [...d.pointers.values()]
      d.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      d.kind = 'pinch'
      d.origScale = currentScale()
      return
    }
    const pointers = new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]])
    if (tool === 'portrait') {
      // moving the figure on the Basic side gives that side its own placement
      if (side === 'basic' && card.basicPortrait.sameAsMaster) update((c) => splitBasicPortrait(c))
      const key = side === 'basic' ? 'basicPortrait' : 'portrait'
      const src = side === 'basic' && card.basicPortrait.sameAsMaster ? card.portrait : card[key]
      const layer = src.layers.find((l) => l.id === activeLayer) ?? src.layers[src.layers.length - 1]
      if (!layer) return
      drag.current = { kind: 'layer', startX: p.x, startY: p.y, origX: layer.x, origY: layer.y, origScale: layer.scale, pointers, startDist: 0 }
    } else if (tool === 'hitzone') {
      const hz = hzBoxFor(card.style)
      const sils = card.hitZone.items.map((it) => env.silhouette(it.imageId, card.hitZone.threshold))
      const slots = hitZoneSlots(card, sils, hz)
      if (side === 'master') {
        for (let i = 0; i < slots.length; i++) {
          const slot = slots[i]
          const t = card.hitZone.items[i]?.target
          if (!slot || !t) continue
          const tx = card.hitZone.flip ? slot.x + slot.w * (1 - t.x) : slot.x + slot.w * t.x
          const ty = slot.y + slot.h * t.y
          const r = Math.max(t.r * (hz.h / 304) * 2.2, 12 * p.upp)
          if (Math.hypot(p.x - tx, p.y - ty) <= r) {
            drag.current = { kind: 'target', startX: p.x, startY: p.y, origX: t.x, origY: t.y, origScale: t.r, pointers, startDist: 0, slot, itemIndex: i }
            setDragging(true)
            return
          }
        }
      }
      drag.current = { kind: 'hz', startX: p.x, startY: p.y, origX: card.hitZone.x, origY: card.hitZone.y, origScale: card.hitZone.scale, pointers, startDist: 0 }
    }
    setDragging(true)
  }

  const currentScale = () => {
    if (tool === 'portrait') {
      const src = side === 'basic' && !card.basicPortrait.sameAsMaster ? card.basicPortrait : card.portrait
      const layer = src.layers.find((l) => l.id === activeLayer) ?? src.layers[src.layers.length - 1]
      return layer?.scale ?? 1
    }
    return card.hitZone.scale
  }

  const applyScale = (s: number) => {
    const clamped = Math.min(5, Math.max(0.05, s))
    if (tool === 'portrait') {
      const key = side === 'basic' ? 'basicPortrait' : 'portrait'
      update((c0) => {
        const c = side === 'basic' ? splitBasicPortrait(c0) : c0
        const layers = c[key].layers
        const idx = layers.findIndex((l) => l.id === activeLayer)
        const i = idx >= 0 ? idx : layers.length - 1
        if (i < 0) return c
        const next = layers.slice()
        next[i] = { ...next[i], scale: clamped }
        return { ...c, [key]: { ...c[key], layers: next } }
      })
    } else if (tool === 'hitzone') {
      update((c) => ({ ...c, hitZone: { ...c.hitZone, scale: Math.min(2, clamped) } }))
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    if (d.pointers.has(e.pointerId)) d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (d.kind === 'pinch') {
      const pts = [...d.pointers.values()]
      if (pts.length < 2) return
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      if (d.startDist > 0) applyScale((d.origScale * dist) / d.startDist)
      return
    }
    const p = toUnits(e)
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    if (d.kind === 'layer') {
      const k = layerScaleFor(card.style, side)
      const key = side === 'basic' ? 'basicPortrait' : 'portrait'
      update((c0) => {
        const c = side === 'basic' ? splitBasicPortrait(c0) : c0
        const layers = c[key].layers
        const idx = layers.findIndex((l) => l.id === activeLayer)
        const i = idx >= 0 ? idx : layers.length - 1
        if (i < 0) return c
        const next = layers.slice()
        next[i] = { ...next[i], x: d.origX + dx / k, y: d.origY + dy / k }
        return { ...c, [key]: { ...c[key], layers: next } }
      })
    } else if (d.kind === 'hz') {
      const hz = hzBoxFor(card.style)
      const k = hz.h / 304
      update((c) => ({ ...c, hitZone: { ...c.hitZone, x: d.origX + dx / k, y: d.origY + dy / k } }))
    } else if (d.kind === 'target' && d.slot) {
      const slot = d.slot
      const idx = d.itemIndex ?? 0
      let fx = (p.x - slot.x) / slot.w
      const fy = (p.y - slot.y) / slot.h
      if (card.hitZone.flip) fx = 1 - fx
      update((c) => {
        const items = c.hitZone.items.map((it, i) =>
          i === idx ? { ...it, target: { r: it.target?.r ?? 4.5, x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) } } : it,
        )
        return { ...c, hitZone: { ...c.hitZone, items } }
      })
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d) return
    d.pointers.delete(e.pointerId)
    if (d.pointers.size === 0) {
      drag.current = null
      setDragging(false)
    } else if (d.kind === 'pinch') {
      // back to a single-finger drag from the remaining pointer
      const p = toUnits([...d.pointers.values()][0] as { clientX?: number } as never)
      void p
      drag.current = null
      setDragging(false)
    }
  }

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (tool === 'none') return
    const f = Math.exp(-e.deltaY * 0.0015)
    applyScale(currentScale() * f)
  }

  // wheel listener must be non-passive to preventDefault
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const h = (ev: WheelEvent) => {
      if (tool === 'none') return
      ev.preventDefault()
    }
    c.addEventListener('wheel', h, { passive: false })
    return () => c.removeEventListener('wheel', h)
  }, [tool])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        className={tool !== 'none' ? (dragging ? 'grabbing' : 'grab') : ''}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  )
}
