import { useEffect, useState } from 'react'
import type { CardDesign, GeneralId, Side, SizeCategory, StyleId, UnitType } from '../model'
import { GENERALS, SIZE_CATEGORIES, STYLES, UNIT_TYPES, isSquad } from '../model'
import { PALETTES } from '../render/palette'
import wordlists from '../data/wordlists.json'
import type { Updater } from '../App'
import type { Tool } from './Preview'
import { Section } from './Section'
import { PowersEditor } from './PowersEditor'
import { getSync } from '../images'
import type { PhotoPurpose } from './PhotoTool'

interface Props {
  card: CardDesign
  update: Updater
  side: Side
  tool: Tool
  setTool: (t: Tool) => void
  activeLayer: string | null
  setActiveLayer: (id: string | null) => void
  openPhoto: (purpose: PhotoPurpose) => void
  openHitZone: () => void
  openPresets: () => void
  openPrint: () => void
  exportPng: (side: Side, dpi?: number) => void
}

const WL = wordlists as { species: string[]; class: string[]; personality: string[]; homeworld: string[] }

export function Editor(p: Props) {
  const { card, update } = p
  const set = <K extends keyof CardDesign>(key: K, value: CardDesign[K]) => update((c) => ({ ...c, [key]: value }))
  const [openSection, setOpenSection] = useState<string>('style')
  const openOnly = (name: string) => (open: boolean) => {
    setOpenSection(open ? name : '')
    if (name === 'photo') p.setTool(open ? 'portrait' : 'none')
    else if (name === 'hitzone') p.setTool(open ? 'hitzone' : 'none')
    else p.setTool('none')
  }

  // keep the tool in sync when the section is switched away
  useEffect(() => {
    if (openSection !== 'photo' && openSection !== 'hitzone' && p.tool !== 'none') p.setTool('none')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSection])

  return (
    <div>
      <datalist id="dl-species">
        {WL.species.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-class">
        {WL.class.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-personality">
        {WL.personality.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-homeworld">
        {WL.homeworld.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Section title="Card style & General" open={openSection === 'style'} onToggle={openOnly('style')}>
        <div className="styleCards">
          {STYLES.map((s) => (
            <div key={s.id} className={'styleCard' + (card.style === s.id ? ' on' : '')} onClick={() => set('style', s.id as StyleId)}>
              <b>{s.name}</b>
              <span>{s.hint}</span>
            </div>
          ))}
        </div>
        <div className="generals">
          {GENERALS.map((g) => {
            const color = g.id === 'custom' ? card.customGeneral.color : PALETTES[g.id].official
            const unavailable = card.style !== 'aoa' && !g.classic
            return (
              <div
                key={g.id}
                className={'general' + (card.general === g.id ? ' on' : '')}
                style={{ opacity: unavailable ? 0.45 : 1 }}
                title={unavailable ? 'Only on the 2024 style (falls back to a neutral frame)' : g.name}
                onClick={() => set('general', g.id as GeneralId)}
              >
                <i style={{ background: color }} />
                {g.name}
              </div>
            )
          })}
        </div>
        {card.general === 'custom' && (
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              <span>Custom general name</span>
              <input type="text" value={card.customGeneral.name} onChange={(e) => set('customGeneral', { ...card.customGeneral, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Colour</span>
              <input type="color" value={card.customGeneral.color} onChange={(e) => set('customGeneral', { ...card.customGeneral, color: e.target.value })} />
            </label>
            <label className="field">
              <span>Emblem</span>
              <div className="row">
                <button className="btn small" onClick={() => p.openPhoto('emblem')}>
                  {card.customGeneral.emblemImageId ? 'Replace' : 'Upload'}
                </button>
                {card.customGeneral.emblemImageId && (
                  <button className="btn small" onClick={() => set('customGeneral', { ...card.customGeneral, emblemImageId: undefined })}>
                    Clear
                  </button>
                )}
              </div>
            </label>
          </div>
        )}
        <p className="muted tiny" style={{ margin: 0 }}>
          Classic frames are scans of the original cards and print a little softer than the 2024 style, which is drawn as vectors at any size.
        </p>
      </Section>

      <Section title="Identity" badge={card.unitName} open={openSection === 'identity'} onToggle={openOnly('identity')}>
        <div className="row">
          <button className="btn small" onClick={p.openPresets}>
            Start from an official unit…
          </button>
        </div>
        <label className="field">
          <span>Unit name</span>
          <input type="text" value={card.unitName} onChange={(e) => set('unitName', e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Species</span>
            <input type="text" list="dl-species" value={card.species} onChange={(e) => set('species', e.target.value)} />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={card.unitType} onChange={(e) => set('unitType', e.target.value as UnitType)}>
              {UNIT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Class</span>
            <input type="text" list="dl-class" value={card.unitClass} onChange={(e) => set('unitClass', e.target.value)} />
          </label>
          <label className="field">
            <span>Personality</span>
            <input type="text" list="dl-personality" value={card.personality} onChange={(e) => set('personality', e.target.value)} />
          </label>
          <label className="field">
            <span>Size</span>
            <select value={card.sizeCategory} onChange={(e) => set('sizeCategory', e.target.value as SizeCategory)}>
              {SIZE_CATEGORIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Height (levels)</span>
            <input type="number" min={1} max={30} value={card.height} onChange={(e) => set('height', Number(e.target.value))} />
          </label>
          {isSquad(card) && (
            <label className="field">
              <span>Figures in squad</span>
              <input type="number" min={1} max={8} value={card.figuresInSquad} onChange={(e) => set('figuresInSquad', Number(e.target.value))} />
            </label>
          )}
          <label className="field">
            <span>Pronoun (for library powers)</span>
            <select value={card.pronoun} onChange={(e) => set('pronoun', e.target.value as CardDesign['pronoun'])}>
              <option value="he">he / him</option>
              <option value="she">she / her</option>
              <option value="it">it / its</option>
              <option value="they">they / them</option>
            </select>
          </label>
        </div>
      </Section>

      <Section title="Stats" badge={`${card.life}·${card.move}·${card.range}·${card.attack}·${card.defense} · ${card.points} pts`} open={openSection === 'stats'} onToggle={openOnly('stats')}>
        <div className="grid6">
          {(
            [
              ['life', 'LIFE'],
              ['move', 'MOVE'],
              ['range', 'RANGE'],
              ['attack', 'ATTACK'],
              ['defense', 'DEFENSE'],
              ['points', 'POINTS'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className={'stat ' + k}>
              <span>{label}</span>
              <input type="number" min={0} max={999} value={card[k]} onChange={(e) => set(k, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </Section>

      <Section title="Special powers" badge={`${card.powers.length}`} open={openSection === 'powers'} onToggle={openOnly('powers')}>
        <PowersEditor card={card} update={update} />
      </Section>

      <Section title="Figure photo" badge={`${card.portrait.layers.length} image${card.portrait.layers.length === 1 ? '' : 's'}`} open={openSection === 'photo'} onToggle={openOnly('photo')}>
        <PortraitSection {...p} which="portrait" />
      </Section>

      <Section title="Hit zone silhouette" badge={card.hitZone.items.length ? `${card.hitZone.items.length}` : 'none'} open={openSection === 'hitzone'} onToggle={openOnly('hitzone')}>
        <HitZoneSection {...p} />
      </Section>

      <Section title="Basic side" open={openSection === 'basic'} onToggle={openOnly('basic')}>
        <label className="check">
          <input
            type="checkbox"
            checked={card.basicPortrait.sameAsMaster}
            onChange={(e) => set('basicPortrait', { ...card.basicPortrait, sameAsMaster: e.target.checked })}
          />
          Use the same figure photo as the Master side
        </label>
        {!card.basicPortrait.sameAsMaster && <PortraitSection {...p} which="basicPortrait" />}
        <div className="grid3">
          <label className="field">
            <span>Homeworld</span>
            <input type="text" list="dl-homeworld" value={card.footer.homeworld} onChange={(e) => set('footer', { ...card.footer, homeworld: e.target.value })} />
          </label>
          <label className="field">
            <span>Card number</span>
            <input type="text" value={card.footer.collection} onChange={(e) => set('footer', { ...card.footer, collection: e.target.value })} />
          </label>
          <label className="field">
            <span>Set name</span>
            <input type="text" value={card.footer.setName} onChange={(e) => set('footer', { ...card.footer, setName: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Credit line (small print)</span>
          <input type="text" placeholder="e.g. Custom by the Cobb brothers" value={card.footer.credit} onChange={(e) => set('footer', { ...card.footer, credit: e.target.value })} />
        </label>
      </Section>

      <Section title="Print & download" open={openSection === 'print'} onToggle={openOnly('print')}>
        <p className="muted tiny" style={{ margin: 0 }}>
          Cards export at true size (4.85 in wide). PNGs carry the card data inside them, so a downloaded PNG can be dropped back into Card Forge to keep editing.
        </p>
        <div className="row">
          <button className="btn" onClick={() => p.exportPng('master')}>
            PNG Master
          </button>
          <button className="btn" onClick={() => p.exportPng('basic')}>
            PNG Basic
          </button>
          <button className="btn primary" onClick={p.openPrint}>
            Print sheet (PDF)…
          </button>
        </div>
      </Section>
    </div>
  )
}

function PortraitSection(p: Props & { which: 'portrait' | 'basicPortrait' }) {
  const { card, update, which } = p
  const port = card[which]
  const setPort = (patch: Partial<typeof port>) => update((c) => ({ ...c, [which]: { ...c[which], ...patch } }))
  const layers = port.layers
  const active = layers.find((l) => l.id === p.activeLayer) ?? layers[layers.length - 1]
  const setLayer = (id: string, patch: Partial<(typeof layers)[number]>) =>
    setPort({ layers: layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  const move = (id: string, dir: -1 | 1) => {
    const i = layers.findIndex((l) => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= layers.length) return
    const next = layers.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setPort({ layers: next })
  }
  const purpose: PhotoPurpose = which === 'portrait' ? 'portrait' : 'basicPortrait'
  return (
    <>
      <div className="row">
        <button className="btn primary" onClick={() => p.openPhoto(purpose)}>
          + Add figure photo
        </button>
        <span className="muted tiny">Upload a photo of the mini on a plain background; the background is removed for you.</span>
      </div>
      {layers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {layers.map((l, i) => {
            const img = getSync(l.imageId)
            return (
              <div key={l.id} className={'layer' + (active?.id === l.id ? ' on' : '')} onClick={() => p.setActiveLayer(l.id)}>
                {img ? <img src={img.src} alt="" /> : <span style={{ width: 40, height: 40 }} />}
                <span className="grow">
                  Figure {i + 1}
                  <br />
                  <span className="muted tiny">{Math.round(l.scale * 100)}%</span>
                </span>
                <button className="iconbtn" title="Flip horizontally" onClick={(e) => (e.stopPropagation(), setLayer(l.id, { flip: !l.flip }))}>
                  ⇋
                </button>
                <button className="iconbtn" title="Send back" onClick={(e) => (e.stopPropagation(), move(l.id, -1))}>
                  ↑
                </button>
                <button className="iconbtn" title="Bring forward" onClick={(e) => (e.stopPropagation(), move(l.id, 1))}>
                  ↓
                </button>
                <button
                  className="iconbtn"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPort({ layers: layers.filter((x) => x.id !== l.id) })
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
      {active && (
        <div className="grid2">
          <label className="field">
            <span>
              Size <b>{Math.round(active.scale * 100)}%</b>
            </span>
            <input type="range" min={0.1} max={3} step={0.01} value={active.scale} onChange={(e) => setLayer(active.id, { scale: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>
              Rotation <b>{active.rotation}°</b>
            </span>
            <input type="range" min={-45} max={45} step={1} value={active.rotation} onChange={(e) => setLayer(active.id, { rotation: Number(e.target.value) })} />
          </label>
        </div>
      )}
      <div className="row">
        <label className="field" style={{ flex: 1 }}>
          <span>Backdrop behind the figure</span>
          <select value={port.backdrop.kind} onChange={(e) => setPort({ backdrop: { ...port.backdrop, kind: e.target.value as typeof port.backdrop.kind } })}>
            <option value="general">General's realm (auto)</option>
            <option value="color">Solid colour</option>
            <option value="image">My own image</option>
            <option value="none">None (card frame shows through)</option>
          </select>
        </label>
        {port.backdrop.kind === 'color' && (
          <label className="field">
            <span>Colour</span>
            <input type="color" value={port.backdrop.color} onChange={(e) => setPort({ backdrop: { ...port.backdrop, color: e.target.value } })} />
          </label>
        )}
        {port.backdrop.kind === 'image' && (
          <label className="field">
            <span>Image</span>
            <button className="btn small" onClick={() => p.openPhoto(which === 'portrait' ? 'backdrop' : 'basicBackdrop')}>
              {port.backdrop.imageId ? 'Replace' : 'Choose'}
            </button>
          </label>
        )}
      </div>
      {port.backdrop.kind === 'image' && port.backdrop.imageId && (
        <label className="field">
          <span>
            Backdrop zoom <b>{Math.round(port.backdrop.imageScale * 100)}%</b>
          </span>
          <input type="range" min={1} max={3} step={0.01} value={port.backdrop.imageScale} onChange={(e) => setPort({ backdrop: { ...port.backdrop, imageScale: Number(e.target.value) } })} />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={port.overflow} onChange={(e) => setPort({ overflow: e.target.checked })} />
        Let the figure break out of the picture window (like the official art)
      </label>
    </>
  )
}

function HitZoneSection(p: Props) {
  const { card, update } = p
  const hz = card.hitZone
  const setHz = (patch: Partial<typeof hz>) => update((c) => ({ ...c, hitZone: { ...c.hitZone, ...patch } }))
  const figures = card.portrait.layers
  return (
    <>
      <p className="muted tiny" style={{ margin: 0 }}>
        The black box shows the figure's silhouette: <b style={{ color: '#ff5a5a' }}>red</b> is the hit zone, <b style={{ color: '#bbb' }}>grey</b> parts cannot be targeted (wings, weapons),
        and the <b style={{ color: '#7ac143' }}>green dot</b> is the Target Point that line of sight is measured from.
      </p>
      <div className="row">
        {figures.length > 0 && (
          <button className="btn" onClick={() => setHz({ items: figures.map((l) => ({ imageId: l.imageId })) })}>
            Use figure photo{figures.length > 1 ? 's' : ''}
          </button>
        )}
        <button className="btn" onClick={() => p.openPhoto('hitzone')}>
          + Upload another cutout
        </button>
        {hz.items.length > 0 && (
          <button className="btn small" onClick={() => setHz({ items: [], paintImageId: undefined })}>
            Clear
          </button>
        )}
      </div>
      {hz.items.length > 0 && (
        <>
          <div className="row">
            <button className="btn primary" onClick={p.openHitZone}>
              Paint grey parts & set target…
            </button>
            <label className="check">
              <input type="checkbox" checked={!!hz.target} onChange={(e) => setHz({ target: e.target.checked ? { x: 0.5, y: 0.12, r: 4.5 } : null })} />
              Show target dot
            </label>
            <label className="check">
              <input type="checkbox" checked={hz.flip} onChange={(e) => setHz({ flip: e.target.checked })} />
              Flip
            </label>
          </div>
          <div className="grid2">
            <label className="field">
              <span>
                Size <b>{Math.round(hz.scale * 100)}%</b>
              </span>
              <input type="range" min={0.2} max={1.4} step={0.01} value={hz.scale} onChange={(e) => setHz({ scale: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>
                Trim base off the bottom <b>{Math.round(hz.trimBottom * 100)}%</b>
              </span>
              <input type="range" min={0} max={0.5} step={0.005} value={hz.trimBottom} onChange={(e) => setHz({ trimBottom: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>
                Edge threshold <b>{hz.threshold}</b>
              </span>
              <input type="range" min={10} max={250} step={1} value={hz.threshold} onChange={(e) => setHz({ threshold: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>
                Target dot size <b>{hz.target?.r ?? 0}</b>
              </span>
              <input type="range" min={2} max={10} step={0.5} value={hz.target?.r ?? 4.5} disabled={!hz.target} onChange={(e) => setHz({ target: { ...(hz.target ?? { x: 0.5, y: 0.12 }), r: Number(e.target.value) } })} />
            </label>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => setHz({ x: 0, y: 0 })}>
              Centre
            </button>
            {hz.items.length > 1 && <span className="muted tiny">Squads: each silhouette is placed automatically in a grid, like the official cards.</span>}
          </div>
        </>
      )}
    </>
  )
}
