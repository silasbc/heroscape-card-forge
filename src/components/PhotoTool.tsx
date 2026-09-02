import { useEffect, useRef, useState } from 'react'
import { addImage, canvasToBlob, decodeUpload } from '../images'
import { imageDataToCanvas, imageToImageData, keyBackground, refineAlpha, trimTransparent } from '../cutout/whitekey'
import { aiAvailable, aiCutout, type CutoutProgress, type ModelKey } from '../cutout/ai'

export type PhotoPurpose = 'portrait' | 'basicPortrait' | 'hitzone' | 'backdrop' | 'basicBackdrop' | 'emblem'

type Method = 'ai' | 'key' | 'none'

interface Props {
  purpose: PhotoPurpose
  /** a file handed in from elsewhere (e.g. the Open button), picked immediately */
  initialFile?: File | null
  onClose: () => void
  onDone: (imageId: string, opts: { alsoHitZone: boolean }) => void
}

const TITLES: Record<PhotoPurpose, string> = {
  portrait: 'Add a figure photo',
  basicPortrait: 'Add a figure photo (Basic side)',
  hitzone: 'Add a cutout for the hit zone',
  backdrop: 'Choose a backdrop image',
  basicBackdrop: 'Choose a backdrop image (Basic side)',
  emblem: 'Upload a custom emblem',
}

export function PhotoTool({ purpose, initialFile, onClose, onDone }: Props) {
  const isCutoutPurpose = purpose === 'portrait' || purpose === 'basicPortrait' || purpose === 'hitzone' || purpose === 'emblem'
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [reading, setReading] = useState(false)
  const origRef = useRef<HTMLCanvasElement>(null)
  const [method, setMethod] = useState<Method>(isCutoutPurpose ? (aiAvailable() ? 'ai' : 'key') : 'none')
  const [model, setModel] = useState<ModelKey>('isnet')
  const [raw, setRaw] = useState<ImageData | null>(null) // cutout before refinement
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tolerance, setTolerance] = useState(28)
  const [feather, setFeather] = useState(1)
  const [erode, setErode] = useState(0)
  const [hardness, setHardness] = useState(0.5)
  const [alsoHitZone, setAlsoHitZone] = useState(purpose === 'portrait')
  const [over, setOver] = useState(false)
  const resultRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const refined = useRef<ImageData | null>(null)

  useEffect(() => {
    if (initialFile) void pickFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  const openPicker = (camera: boolean) => {
    const input = fileRef.current
    if (!input) return
    if (camera) input.setAttribute('capture', 'environment')
    else input.removeAttribute('capture')
    input.click()
  }

  const pickFile = async (f: File | undefined | null) => {
    if (!f) return
    setError(null)
    setRaw(null)
    setReading(true)
    try {
      const { img } = await decodeUpload(f)
      // downscale once into a canvas; every later step reads from it directly
      const maxSide = 2400
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.naturalWidth * scale))
      c.height = Math.max(1, Math.round(img.naturalHeight * scale))
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, c.width, c.height)
      setSrc(c)
    } catch (err) {
      setError(
        'Could not read that image (' +
          (err as Error).message +
          '). JPG, PNG, WebP and HEIC photos work; if it came from another app, try saving it as a JPG first.',
      )
    } finally {
      setReading(false)
    }
  }

  // original preview
  useEffect(() => {
    const c = origRef.current
    if (!c || !src) return
    const s = Math.min(1, 520 / Math.max(src.width, src.height))
    c.width = Math.max(1, Math.round(src.width * s))
    c.height = Math.max(1, Math.round(src.height * s))
    c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  }, [src])

  // run the chosen method whenever inputs change
  useEffect(() => {
    if (!src) return
    let cancelled = false
    ;(async () => {
      setError(null)
      if (method === 'none') {
        setRaw(imageToImageData(src))
        return
      }
      if (method === 'key') {
        setBusy('Keying background…')
        await new Promise((r) => setTimeout(r, 10))
        const id = keyBackground(imageToImageData(src), { tolerance, feather: 0, erode: 0 })
        if (!cancelled) {
          setRaw(id)
          setBusy(null)
        }
        return
      }
      // AI
      setBusy('Preparing model…')
      setProgress(0)
      try {
        const id = await aiCutout(
          src,
          model,
          (p: CutoutProgress) => {
            if (cancelled) return
            if (p.stage === 'download') {
              const pct = p.total ? Math.round(((p.loaded ?? 0) / p.total) * 100) : null
              setProgress(pct)
              setBusy(p.cached ? 'Loading model from cache…' : `Downloading model ${pct ?? ''}${pct !== null ? '%' : ''} (one time, ~${model === 'isnet' ? '45–90' : '115'} MB)…`)
            } else if (p.stage === 'init') setBusy(`Starting model on ${p.device === 'webgpu' ? 'GPU' : 'CPU'}…`)
            else if (p.stage === 'run') setBusy(`Finding the figure (${p.device === 'webgpu' ? 'GPU' : 'CPU — may take a minute'})…`)
            else if (p.stage === 'compose') setBusy('Compositing…')
          },
          true,
        )
        if (!cancelled) setRaw(id)
      } catch (err) {
        if (!cancelled) {
          setError('Automatic cutout failed (' + (err as Error).message + '). Try the plain-background method.')
          setMethod('key')
        }
      } finally {
        if (!cancelled) {
          setBusy(null)
          setProgress(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [src, method, model, tolerance])

  // refine + preview
  useEffect(() => {
    const c = resultRef.current
    if (!c || !raw) return
    const out = method === 'none' ? raw : refineAlpha(raw, { hardness: method === 'ai' ? hardness : 0.2, feather, erode })
    refined.current = out
    const trimmed = isCutoutPurpose && method !== 'none' ? trimTransparent(out, 6) : out
    const maxSide = 520
    const s = Math.min(1, maxSide / Math.max(trimmed.width, trimmed.height))
    c.width = Math.max(1, Math.round(trimmed.width * s))
    c.height = Math.max(1, Math.round(trimmed.height * s))
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imageDataToCanvas(trimmed), 0, 0, c.width, c.height)
  }, [raw, feather, erode, hardness, method, isCutoutPurpose])

  const confirm = async () => {
    if (!refined.current) return
    setBusy('Saving…')
    try {
      const out = isCutoutPurpose && method !== 'none' ? trimTransparent(refined.current, 6) : refined.current
      const blob = await canvasToBlob(imageDataToCanvas(out), 'image/png')
      const id = await addImage(blob)
      onDone(id, { alsoHitZone })
    } catch (err) {
      setError('Could not save image: ' + (err as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="modalBack" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{TITLES[purpose]}</h2>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="body">
          {!src ? (
            <>
              {reading && (
                <div className="statusLine">
                  <span className="spinner" /> Reading photo…
                </div>
              )}
              {error && <div style={{ color: '#ff8a8a' }}>{error}</div>}
              <div
                className={'drop' + (over ? ' over' : '')}
                style={{ opacity: reading ? 0.4 : 1, pointerEvents: reading ? 'none' : 'auto' }}
                onClick={() => openPicker(false)}
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(false)
                  void pickFile(e.dataTransfer.files?.[0])
                }}
              >
                <div style={{ fontSize: 30 }}>📷</div>
                <div>
                  <b>Tap to choose a photo</b> or drop one here
                </div>
                <div className="tiny" style={{ marginTop: 6 }}>
                  {isCutoutPurpose ? 'Best results: the mini on plain white paper, even light, filling most of the frame.' : 'Any photo.'} JPG, PNG, WebP or HEIC.
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                hidden
                onChange={(e) => {
                  void pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {isCutoutPurpose && (
                <div className="row">
                  <button className="btn" onClick={() => openPicker(true)}>
                    Take a photo now
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {isCutoutPurpose && (
                <div className="row">
                  <span className="muted tiny">Background removal:</span>
                  <div className="seg">
                    {aiAvailable() && (
                      <button className={method === 'ai' ? 'on' : ''} onClick={() => setMethod('ai')}>
                        Automatic (AI)
                      </button>
                    )}
                    <button className={method === 'key' ? 'on' : ''} onClick={() => setMethod('key')}>
                      Plain background
                    </button>
                    <button className={method === 'none' ? 'on' : ''} onClick={() => setMethod('none')}>
                      Keep as is
                    </button>
                  </div>
                  {method === 'ai' && (
                    <select value={model} onChange={(e) => setModel(e.target.value as ModelKey)} style={{ width: 'auto', minWidth: 190 }}>
                      <option value="isnet">Standard (45–90 MB)</option>
                      <option value="birefnet">High quality (115 MB, GPU)</option>
                    </select>
                  )}
                </div>
              )}
              {busy && (
                <div className="statusLine">
                  <span className="spinner" /> {busy}
                  {progress !== null && (
                    <div className="progress" style={{ flex: 1, minWidth: 80 }}>
                      <i style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              )}
              <div className="photoGrid">
                <div>
                  <div className="muted tiny" style={{ marginBottom: 4 }}>
                    Original
                  </div>
                  <div className="checker" style={{ height: 300 }}>
                    <canvas ref={origRef} />
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn small" onClick={() => setSrc(null)}>
                      Choose another photo
                    </button>
                  </div>
                </div>
                <div>
                  <div className="muted tiny" style={{ marginBottom: 4 }}>
                    Result
                  </div>
                  <div className="checker" style={{ height: 300, position: 'relative' }}>
                    <canvas ref={resultRef} style={{ display: raw && !busy ? 'block' : 'none' }} />
                    {(busy || !raw) && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center' }}>
                        <div>{busy ?? 'Working…'}</div>
                        {progress !== null && (
                          <div className="progress" style={{ width: '80%' }}>
                            <i style={{ width: `${progress}%` }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {error && <div style={{ color: '#ff8a8a' }}>{error}</div>}
              {isCutoutPurpose && method !== 'none' && (
                <div className="grid3">
                  {method === 'key' && (
                    <label className="field">
                      <span>
                        Background tolerance <b>{tolerance}</b>
                      </span>
                      <input type="range" min={2} max={100} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
                    </label>
                  )}
                  {method === 'ai' && (
                    <label className="field">
                      <span>
                        Edge hardness <b>{hardness.toFixed(2)}</b>
                      </span>
                      <input type="range" min={0} max={1} step={0.05} value={hardness} onChange={(e) => setHardness(Number(e.target.value))} />
                    </label>
                  )}
                  <label className="field">
                    <span>
                      Edge softness <b>{feather}</b>
                    </span>
                    <input type="range" min={0} max={5} step={0.5} value={feather} onChange={(e) => setFeather(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <span>
                      Shrink edges (kill halo) <b>{erode}</b>
                    </span>
                    <input type="range" min={0} max={4} step={1} value={erode} onChange={(e) => setErode(Number(e.target.value))} />
                  </label>
                </div>
              )}
              {purpose === 'portrait' && (
                <label className="check">
                  <input type="checkbox" checked={alsoHitZone} onChange={(e) => setAlsoHitZone(e.target.checked)} />
                  Also use this cutout for the hit-zone silhouette
                </label>
              )}
            </>
          )}
        </div>
        <footer>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!raw || !!busy} onClick={confirm}>
            {purpose === 'hitzone' ? 'Add silhouette' : purpose === 'emblem' ? 'Use emblem' : purpose.includes('ackdrop') ? 'Use backdrop' : 'Add to card'}
          </button>
        </footer>
      </div>
    </div>
  )
}
