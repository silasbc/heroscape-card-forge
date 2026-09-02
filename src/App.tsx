import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CardDesign, Side } from './model'
import { applyPreset, newCard, newId, type Preset } from './model'
import { deleteCard, garbageCollectImages, imageIdsFromCards, listCards, requestPersistence, saveCard } from './storage'
import { loadFonts } from './fonts'
import { addImage } from './images'
import { downloadBlob, exportJson, exportPdf, exportPng, importBundle, parseImport, slug } from './export'
import { renderToCanvas } from './render'
import { aiCutout, warmUpWorker } from './cutout/ai'
import { Preview, type Tool } from './components/Preview'
import { Editor } from './components/Editor'
import { Gallery } from './components/Gallery'
import { PrintDialog } from './components/PrintDialog'
import { PhotoTool, type PhotoPurpose } from './components/PhotoTool'
import { HitZoneEditor } from './components/HitZoneEditor'
import { PresetPicker } from './components/PresetPicker'
import { Toast, useToast } from './components/Toast'

export type Updater = (fn: (c: CardDesign) => CardDesign) => void

let demoPromise: Promise<void> | null = null

export default function App() {
  const [ready, setReady] = useState(false)
  const [cards, setCards] = useState<CardDesign[]>([])
  const [card, setCard] = useState<CardDesign | null>(null)
  const [view, setView] = useState<'editor' | 'gallery'>('editor')
  const [side, setSide] = useState<Side>('master')
  const [tool, setTool] = useState<Tool>('none')
  const [activeLayer, setActiveLayer] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ purpose: PhotoPurpose; file?: File | null } | null>(null)
  const [hzEdit, setHzEdit] = useState(false)
  const [print, setPrint] = useState(false)
  const [presets, setPresets] = useState(false)
  const [menu, setMenu] = useState(false)
  const { toast, show } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [updateReady, setUpdateReady] = useState(false)

  // notice newer deploys (index.html can be cached for a few minutes)
  useEffect(() => {
    if (import.meta.env.DEV) return
    let stop = false
    const check = async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}version.json?_=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const v = (await r.json()) as { build?: string }
        if (!stop && v.build && v.build !== __BUILD_ID__) setUpdateReady(true)
      } catch {
        /* offline */
      }
    }
    void check()
    const id = window.setInterval(check, 5 * 60 * 1000)
    const onVis = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // boot
  useEffect(() => {
    let alive = true
    ;(async () => {
      await loadFonts()
      let list = await listCards()
      if (!list.length) {
        // shared promise: React StrictMode runs this effect twice in development
        demoPromise ??= (async () => {
          const demo = await makeDemoCard()
          if (!(await listCards()).length) await saveCard(demo)
        })()
        await demoPromise
        list = await listCards()
      }
      if (!alive) return
      setCards(list)
      setCard(list[0])
      setReady(true)
      setTimeout(warmUpWorker, 1500)
    })()
    return () => {
      alive = false
    }
  }, [])

  // autosave
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!card) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveCard(card)
      setCards((prev) => {
        const i = prev.findIndex((c) => c.id === card.id)
        if (i < 0) return [card, ...prev]
        const next = prev.slice()
        next[i] = card
        return next
      })
    }, 500)
  }, [card])

  const update: Updater = useCallback((fn) => {
    setCard((c) => (c ? { ...fn(c), updatedAt: Date.now() } : c))
  }, [])

  // dev-only hooks so the app can be exercised from the console
  const cardRef = useRef<CardDesign | null>(null)
  cardRef.current = card
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __cardForge?: unknown }).__cardForge = {
      exportPng,
      exportPdf,
      renderToCanvas,
      aiCutout,
      getCard: () => cardRef.current,
      update,
    }
  }, [update])

  const openCard = (c: CardDesign) => {
    setCard(c)
    setView('editor')
    setTool('none')
    setActiveLayer(null)
  }

  const createCard = async () => {
    const c = newCard({ style: card?.style ?? 'aoa', general: card?.general ?? 'jandar' })
    await saveCard(c)
    setCards((p) => [c, ...p])
    openCard(c)
    show('New card created')
  }

  const duplicateCard = async (src: CardDesign) => {
    const c: CardDesign = {
      ...src,
      id: newId(),
      unitName: src.unitName + ' copy',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      powers: src.powers.map((p) => ({ ...p, id: newId() })),
    }
    await saveCard(c)
    setCards((p) => [c, ...p])
    openCard(c)
  }

  const removeCard = async (id: string) => {
    if (!confirm('Delete this card? This cannot be undone.')) return
    await deleteCard(id)
    const rest = cards.filter((c) => c.id !== id)
    setCards(rest)
    void garbageCollectImages(imageIdsFromCards(rest))
    if (card?.id === id) {
      if (rest.length) setCard(rest[0])
      else {
        const c = newCard()
        await saveCard(c)
        setCards([c])
        setCard(c)
      }
    }
  }

  const doExportPng = async (which: Side, dpi = 300) => {
    if (!card) return
    setMenu(false)
    show(`Rendering ${which} side at ${dpi} dpi…`)
    try {
      const blob = await exportPng(card, which, dpi)
      downloadBlob(blob, `${slug(card.unitName)}-${which}-${dpi}dpi.png`)
      show('PNG saved. It also works as a save file: drop it back in to edit.')
    } catch (err) {
      show('Export failed: ' + (err as Error).message)
    }
  }

  const doExportJson = async (all: boolean) => {
    setMenu(false)
    const list = all ? cards : card ? [card] : []
    const blob = await exportJson(list)
    downloadBlob(blob, all ? 'card-forge-all-cards.json' : `${slug(card?.unitName ?? 'card')}.json`)
  }

  const doImport = async (files: FileList | null) => {
    if (!files?.length) return
    let n = 0
    for (const f of Array.from(files)) {
      const b = await parseImport(f)
      if (!b) {
        const isPhoto = f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp)$/i.test(f.name)
        if (isPhoto) {
          // a plain picture: treat it as a figure photo rather than a saved card
          setView('editor')
          setPhoto({ purpose: 'portrait', file: f })
          show('That is a photo, so it is being added as a figure photo.')
          return
        }
        show(`${f.name}: not a Card Forge file or a photo`)
        continue
      }
      const saved = await importBundle(b)
      n += saved.length
      setCards((p) => [...saved, ...p])
      if (saved.length) openCard(saved[0])
    }
    if (n) show(`Imported ${n} card${n === 1 ? '' : 's'}`)
  }

  const onPhotoDone = async (imageId: string, opts: { alsoHitZone: boolean }) => {
    const purpose = photo?.purpose
    setPhoto(null)
    if (!purpose) return
    void requestPersistence()
    update((c) => {
      const next = { ...c }
      if (purpose === 'portrait' || purpose === 'basicPortrait') {
        const layer = { id: newId(), imageId, x: 0, y: 0, scale: 0.92, flip: false, rotation: 0 }
        if (purpose === 'portrait') {
          next.portrait = { ...c.portrait, layers: [...c.portrait.layers, layer] }
          if (opts.alsoHitZone) next.hitZone = { ...c.hitZone, items: [...c.hitZone.items, { imageId }] }
        } else {
          next.basicPortrait = { ...c.basicPortrait, sameAsMaster: false, layers: [...c.basicPortrait.layers, layer] }
        }
        setActiveLayer(layer.id)
        setTool('portrait')
      } else if (purpose === 'hitzone') {
        next.hitZone = { ...c.hitZone, items: [...c.hitZone.items, { imageId }] }
        setTool('hitzone')
      } else if (purpose === 'backdrop') {
        next.portrait = { ...c.portrait, backdrop: { ...c.portrait.backdrop, kind: 'image', imageId } }
      } else if (purpose === 'basicBackdrop') {
        next.basicPortrait = { ...c.basicPortrait, sameAsMaster: false, backdrop: { ...c.basicPortrait.backdrop, kind: 'image', imageId } }
      } else if (purpose === 'emblem') {
        next.customGeneral = { ...c.customGeneral, emblemImageId: imageId }
        next.general = 'custom'
      }
      return next
    })
  }

  const applyPresetToCard = (p: Preset) => {
    setPresets(false)
    update((c) => applyPreset(c, p))
    show(`Loaded ${p.n}`)
  }

  const hint = useMemo(() => {
    if (tool === 'portrait') return 'Drag the figure to move it · scroll or pinch to resize · use the sliders for fine control'
    if (tool === 'hitzone') return 'Drag the silhouette to move it · drag the green dot to set the target point · scroll or pinch to resize'
    return 'Tip: pick a Photo or Hit zone section to move things directly on the card'
  }, [tool])

  if (!ready || !card) return <div className="loading">Loading Card Forge…</div>

  return (
    <div className="app" onClick={() => menu && setMenu(false)}>
      <header className="topbar">
        <div className="brand">
          <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" />
          <h1>
            Card Forge <small>Heroscape army card maker</small>
            <span className="version" title="App version">v{__BUILD_ID__.split('+')[0]}</span>
          </h1>
        </div>
        <div className="seg">
          <button className={view === 'editor' ? 'on' : ''} onClick={() => setView('editor')}>
            Editor
          </button>
          <button className={view === 'gallery' ? 'on' : ''} onClick={() => setView('gallery')}>
            My cards ({cards.length})
          </button>
        </div>
        <button className="btn" onClick={createCard}>
          + New
        </button>
        <button className="btn primary" onClick={() => setPhoto({ purpose: 'portrait' })} title="Add a photo of your mini to the card">
          📷 Add photo
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} title="Open a saved card (.png or .json) or a photo">
          Open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.json,.jpg,.jpeg,.webp,.heic,.heif,image/*,application/json"
          multiple
          hidden
          onChange={(e) => {
            void doImport(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          <button className="btn" onClick={() => setMenu((m) => !m)}>
            Download ▾
          </button>
          {menu && (
            <div className="pop">
              <button onClick={() => doExportPng('master')}>PNG · Master side (300 dpi)</button>
              <button onClick={() => doExportPng('basic')}>PNG · Basic side (300 dpi)</button>
              <button onClick={() => doExportPng('master', 600)}>PNG · Master side (600 dpi)</button>
              <button onClick={() => doExportPng('basic', 600)}>PNG · Basic side (600 dpi)</button>
              <hr />
              <button
                onClick={() => {
                  setMenu(false)
                  setPrint(true)
                }}
              >
                Print sheet (PDF)…
              </button>
              <hr />
              <button onClick={() => doExportJson(false)}>Save file · this card (.json)</button>
              <button onClick={() => doExportJson(true)}>Backup · all cards (.json)</button>
            </div>
          )}
        </div>
      </header>

      {view === 'gallery' ? (
        <Gallery
          cards={cards}
          currentId={card.id}
          onOpen={openCard}
          onDuplicate={duplicateCard}
          onDelete={removeCard}
          onNew={createCard}
          onExport={(c) => exportPng(c, 'master').then((b) => downloadBlob(b, `${slug(c.unitName)}-master-300dpi.png`))}
        />
      ) : (
        <div className="main">
          <div className="editor">
            <Editor
              card={card}
              update={update}
              side={side}
              tool={tool}
              setTool={setTool}
              activeLayer={activeLayer}
              setActiveLayer={setActiveLayer}
              openPhoto={(purpose) => setPhoto({ purpose })}
              openHitZone={() => setHzEdit(true)}
              openPresets={() => setPresets(true)}
              openPrint={() => setPrint(true)}
              exportPng={doExportPng}
            />
          </div>
          <div className="previewPane">
            <div className="previewBar">
              <div className="seg">
                <button className={side === 'master' ? 'on' : ''} onClick={() => setSide('master')}>
                  Master side
                </button>
                <button className={side === 'basic' ? 'on' : ''} onClick={() => setSide('basic')}>
                  Basic side
                </button>
              </div>
              <span className="muted tiny">{card.unitName}</span>
            </div>
            <div className="canvasWrap">
              <Preview card={card} side={side} tool={tool} activeLayer={activeLayer} update={update} />
            </div>
            <div className="previewHint">{hint}</div>
          </div>
        </div>
      )}

      {photo && <PhotoTool purpose={photo.purpose} initialFile={photo.file} onClose={() => setPhoto(null)} onDone={onPhotoDone} />}
      {hzEdit && <HitZoneEditor card={card} update={update} onClose={() => setHzEdit(false)} />}
      {print && <PrintDialog cards={cards} current={card} onClose={() => setPrint(false)} />}
      {presets && <PresetPicker onPick={applyPresetToCard} onClose={() => setPresets(false)} />}
      <Toast toast={toast} />
      {updateReady && (
        <div className="updateBar">
          A newer version of Card Forge is available.
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
    </div>
  )
}

/** First-run example so the app never opens empty. */
async function makeDemoCard(): Promise<CardDesign> {
  const c = newCard({
    style: 'aoa',
    general: 'jandar',
    unitName: 'Raelin the Kyrie Warrior',
    species: 'Kyrie',
    unitType: 'Unique Hero',
    unitClass: 'Warrior',
    personality: 'Merciful',
    sizeCategory: 'Medium',
    height: 5,
    life: 5,
    move: 6,
    range: 1,
    attack: 3,
    defense: 3,
    points: 80,
    pronoun: 'she',
    powers: [
      {
        id: newId(),
        name: 'Defensive Aura',
        text: "All figures you control within 4 clear sight spaces of Raelin add 2 to their defense dice. Raelin's Defensive Aura does not affect Raelin.",
      },
      {
        id: newId(),
        name: 'Flying',
        text: "When counting spaces for Raelin's movement, ignore elevations. Raelin may fly over water without stopping, pass over figures without becoming engaged, and fly over obstacles such as ruins. When Raelin starts to fly, if she is engaged she will take any leaving engagement attacks.",
      },
    ],
    footer: { homeworld: 'Feylund', setName: 'Card Forge example', collection: '1', credit: '' },
  })
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'sample-figure.png')
    if (res.ok) {
      const blob = await res.blob()
      const id = await addImage(blob)
      c.portrait.layers.push({ id: newId(), imageId: id, x: -8, y: 72, scale: 0.93, flip: false, rotation: 0 })
      c.hitZone.items.push({ imageId: id })
      c.hitZone.scale = 0.5
      c.hitZone.trimBottom = 0.1
      c.hitZone.target = { x: 0.47, y: 0.42, r: 4.5 }
    }
  } catch {
    /* offline: fine */
  }
  return c
}
