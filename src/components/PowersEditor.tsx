import { useEffect, useMemo, useState } from 'react'
import type { CardDesign } from '../model'
import { isSquad, newId } from '../model'
import type { Updater } from '../App'

interface LibPower {
  name: string
  param: 'number' | 'string' | null
  hero: string
  squad: string
  uncommon: string
}

let libCache: LibPower[] | null = null
async function loadLibrary(): Promise<LibPower[]> {
  if (libCache) return libCache
  const mod = await import('../data/powers.json')
  libCache = (mod.default as LibPower[]).slice()
  return libCache
}

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']

function resolveParam(text: string, param: string | null, value: string): string {
  if (!param) return text
  const n = Number(value)
  const word = Number.isFinite(n) && n >= 0 && n <= 20 ? numberWords[n] : value
  return text
    .replace(/\{N_PLURAL:([^|}]*)\|([^}]*)\}/g, (_, a: string, b: string) => (n === 1 ? a : b))
    .replace(/\{N_PLURAL\}/g, value.endsWith('s') ? value : value + 's')
    .replace(/\{N_WORD\}/g, word)
    .replace(/\{N-1\}/g, String(Number.isFinite(n) ? n - 1 : ''))
    .replace(/\{N\}/g, value)
}

export function PowersEditor({ card, update }: { card: CardDesign; update: Updater }) {
  const powers = card.powers
  const setPowers = (list: CardDesign['powers']) => update((c) => ({ ...c, powers: list }))
  const [libOpen, setLibOpen] = useState(false)
  const [lib, setLib] = useState<LibPower[]>([])
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<LibPower | null>(null)
  const [paramVal, setParamVal] = useState('1')

  useEffect(() => {
    if (libOpen && !lib.length) void loadLibrary().then(setLib)
  }, [libOpen, lib.length])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? lib.filter((p) => p.name.toLowerCase().includes(s) || p.hero.toLowerCase().includes(s)) : lib
    return list.slice(0, 60)
  }, [lib, q])

  const variantFor = (p: LibPower) => (isSquad(card) ? p.squad : card.unitType === 'Uncommon Hero' ? p.uncommon : p.hero)

  const addFromLib = (p: LibPower, value: string) => {
    const text = resolveParam(variantFor(p), p.param, value)
    const name = p.param === 'number' ? `${p.name} ${value}` : p.param === 'string' ? `${p.name} ${value}`.trim() : p.name
    setPowers([...powers, { id: newId(), name, text }])
    setPick(null)
    setLibOpen(false)
    setQ('')
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= powers.length) return
    const next = powers.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setPowers(next)
  }

  return (
    <>
      {powers.map((pw, i) => (
        <div key={pw.id} className="power">
          <div className="row">
            <input type="text" placeholder="POWER NAME" value={pw.name} onChange={(e) => setPowers(powers.map((x) => (x.id === pw.id ? { ...x, name: e.target.value } : x)))} />
            <button className="iconbtn" title="Move up" onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="iconbtn" title="Move down" onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="iconbtn" title="Remove" onClick={() => setPowers(powers.filter((x) => x.id !== pw.id))}>
              ✕
            </button>
          </div>
          <textarea
            placeholder="Power text (leave empty for keyword-only powers like FLYING)"
            value={pw.text}
            onChange={(e) => setPowers(powers.map((x) => (x.id === pw.id ? { ...x, text: e.target.value } : x)))}
          />
        </div>
      ))}
      <div className="row">
        <button className="btn" onClick={() => setPowers([...powers, { id: newId(), name: '', text: '' }])}>
          + Blank power
        </button>
        <button className="btn" onClick={() => setLibOpen((o) => !o)}>
          {libOpen ? 'Close library' : 'Add from official powers library…'}
        </button>
      </div>
      <p className="muted tiny" style={{ margin: 0 }}>
        Text shrinks automatically to fit the card. Use <kbd>{'{NAME}'}</kbd> in your own text to insert the unit name.
      </p>
      {libOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="search" autoFocus placeholder="Search 329 official powers (Flying, Bonding, Counter Strike…)" value={q} onChange={(e) => setQ(e.target.value)} />
          {pick ? (
            <div className="power">
              <b>{pick.name}</b>
              <div className="muted tiny">{resolveParam(variantFor(pick), pick.param, paramVal).replace(/\{NAME\}/g, card.unitName || 'this figure')}</div>
              {pick.param && (
                <label className="field">
                  <span>{pick.param === 'number' ? 'Number' : 'Value'}</span>
                  <input type={pick.param === 'number' ? 'number' : 'text'} value={paramVal} onChange={(e) => setParamVal(e.target.value)} />
                </label>
              )}
              <div className="row">
                <button className="btn primary" onClick={() => addFromLib(pick, paramVal)}>
                  Add this power
                </button>
                <button className="btn" onClick={() => setPick(null)}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="libList">
              {!lib.length && <div className="muted" style={{ padding: 10 }}>Loading…</div>}
              {results.map((p) => (
                <button
                  key={p.name}
                  onClick={() => {
                    setPick(p)
                    setParamVal(p.param === 'number' ? '1' : '')
                  }}
                >
                  {p.name}
                  {p.param ? ` (${p.param})` : ''}
                  <small>{p.hero.replace(/\{NAME\}/g, card.unitName || 'this figure')}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
