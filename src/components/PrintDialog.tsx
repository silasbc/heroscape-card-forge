import { useState } from 'react'
import type { CardDesign } from '../model'
import { downloadBlob, exportPdf, type PdfOptions } from '../export'

export function PrintDialog({ cards, current, onClose }: { cards: CardDesign[]; current: CardDesign; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set([current.id]))
  const [opts, setOpts] = useState<PdfOptions>({ dpi: 300, sides: 'both', cutGuides: true, paper: 'letter' })
  const [busy, setBusy] = useState<string | null>(null)
  const toggle = (id: string) => {
    const n = new Set(selected)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setSelected(n)
  }
  const go = async () => {
    const list = cards.filter((c) => selected.has(c.id))
    if (!list.length) return
    setBusy('Rendering…')
    try {
      const blob = await exportPdf(list, opts, (done, total) => setBusy(`Rendering ${done} / ${total}…`))
      downloadBlob(blob, list.length === 1 ? `${list[0].unitName.replace(/[^a-z0-9]+/gi, '-')}-print.pdf` : 'card-forge-print-sheet.pdf')
      onClose()
    } catch (err) {
      setBusy('Failed: ' + (err as Error).message)
    }
  }
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" style={{ width: 'min(620px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Print sheet</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="body">
          <p className="muted tiny" style={{ margin: 0 }}>
            Two cards per page at true size. With both sides selected, Master pages are followed by matching Basic pages, so print double-sided and flip on the long edge. Print at 100%, no scaling.
          </p>
          <div className="grid2">
            <label className="field">
              <span>Sides</span>
              <select value={opts.sides} onChange={(e) => setOpts({ ...opts, sides: e.target.value as PdfOptions['sides'] })}>
                <option value="both">Master + Basic (double-sided)</option>
                <option value="master">Master only</option>
                <option value="basic">Basic only</option>
              </select>
            </label>
            <label className="field">
              <span>Paper</span>
              <select value={opts.paper} onChange={(e) => setOpts({ ...opts, paper: e.target.value as PdfOptions['paper'] })}>
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label className="field">
              <span>Quality</span>
              <select value={opts.dpi} onChange={(e) => setOpts({ ...opts, dpi: Number(e.target.value) })}>
                <option value={300}>300 dpi (recommended)</option>
                <option value={450}>450 dpi</option>
                <option value={600}>600 dpi (large file)</option>
              </select>
            </label>
            <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={opts.cutGuides} onChange={(e) => setOpts({ ...opts, cutGuides: e.target.checked })} />
              Thin cut guide lines
            </label>
          </div>
          <div className="libList" style={{ maxHeight: 260 }}>
            {cards.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)}>
                <input type="checkbox" readOnly checked={selected.has(c.id)} style={{ marginRight: 8 }} />
                {c.unitName || 'Untitled'} <small>{c.unitType} · {c.points} pts</small>
              </button>
            ))}
          </div>
        </div>
        <footer>
          <span className="muted tiny" style={{ marginRight: 'auto', alignSelf: 'center' }}>
            {busy ?? `${selected.size} card${selected.size === 1 ? '' : 's'} selected`}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!busy || !selected.size} onClick={go}>
            Make PDF
          </button>
        </footer>
      </div>
    </div>
  )
}
