import { useEffect, useState } from 'react'
import type { CardDesign } from '../model'
import { thumbnail } from '../export'
import { onImagesChanged } from '../images'

interface Props {
  cards: CardDesign[]
  currentId: string
  onOpen: (c: CardDesign) => void
  onDuplicate: (c: CardDesign) => void
  onDelete: (id: string) => void
  onNew: () => void
  onExport: (c: CardDesign) => void
}

export function Gallery(p: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [tick, setTick] = useState(0)
  useEffect(() => onImagesChanged(() => setTick((t) => t + 1)), [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const c of p.cards) {
        const key = c.id + ':' + c.updatedAt + ':' + tick
        if (thumbs[key]) continue
        try {
          const url = await thumbnail(c, 360)
          if (!alive) return
          setThumbs((t) => ({ ...t, [key]: url }))
        } catch {
          /* ignore */
        }
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.cards, tick])

  return (
    <div>
      <div className="row" style={{ padding: '14px 16px 0' }}>
        <button className="btn primary" onClick={p.onNew}>
          + New card
        </button>
        <span className="muted tiny">Cards are saved in this browser automatically. Download a backup from the Download menu to move them to another device.</span>
      </div>
      <div className="gallery">
        {p.cards.map((c) => {
          const key = c.id + ':' + c.updatedAt + ':' + tick
          const url = thumbs[key] ?? Object.entries(thumbs).find(([k]) => k.startsWith(c.id + ':'))?.[1]
          return (
            <div key={c.id} className="gcard" style={{ outline: c.id === p.currentId ? '1px solid var(--accent)' : undefined }}>
              {url ? <img src={url} alt={c.unitName} onClick={() => p.onOpen(c)} /> : <div style={{ aspectRatio: '1000/940' }} className="checker" />}
              <b>{c.unitName || 'Untitled'}</b>
              <span className="muted tiny">
                {c.unitType} · {c.points} pts · {new Date(c.updatedAt).toLocaleDateString()}
              </span>
              <div className="row">
                <button className="btn small" onClick={() => p.onOpen(c)}>
                  Edit
                </button>
                <button className="btn small" onClick={() => p.onDuplicate(c)}>
                  Duplicate
                </button>
                <button className="btn small" onClick={() => p.onExport(c)}>
                  PNG
                </button>
                <button className="btn small danger" onClick={() => p.onDelete(c.id)}>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
