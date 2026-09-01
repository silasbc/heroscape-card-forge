import { useEffect, useMemo, useState } from 'react'
import type { Preset } from '../model'

let cache: Preset[] | null = null
async function loadPresets(): Promise<Preset[]> {
  if (cache) return cache
  const mod = await import('../data/presets.json')
  cache = mod.default as Preset[]
  return cache
}

export function PresetPicker({ onPick, onClose }: { onPick: (p: Preset) => void; onClose: () => void }) {
  const [list, setList] = useState<Preset[]>([])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('All')
  useEffect(() => {
    void loadPresets().then(setList)
  }, [])
  const groups = useMemo(() => ['All', ...Array.from(new Set(list.map((p) => p.grp))).sort()], [list])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    return list
      .filter((p) => group === 'All' || p.grp === group)
      .filter((p) => !s || p.n.toLowerCase().includes(s) || p.sp.toLowerCase().includes(s) || p.cl.toLowerCase().includes(s) || p.gn.toLowerCase().includes(s))
      .slice(0, 80)
  }, [list, q, group])
  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" style={{ width: 'min(640px,100%)' }} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Start from an official unit</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="body">
          <p className="muted tiny" style={{ margin: 0 }}>
            Copies the stats and power text of an existing unit onto this card so you can tweak it. Photos and hit zones are not included. Data from the community unit database.
          </p>
          <div className="row">
            <input type="search" autoFocus placeholder="Search 536 units by name, species, class, general…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: 150 }}>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="libList" style={{ maxHeight: '55vh' }}>
            {!list.length && <div className="muted" style={{ padding: 10 }}>Loading…</div>}
            {results.map((p) => (
              <button key={p.n + p.set} onClick={() => onPick(p)}>
                {p.n} <span className="muted tiny">· {p.gn} · {p.pt} pts</span>
                <small>
                  {p.ty} · {p.sp} · {p.cl} · {p.pe} · {p.sz} {p.ht} · {p.grp}
                  {p.set ? ` · ${p.set}` : ''}
                </small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
