// Card data model. Everything a card needs to be re-rendered lives here,
// with images referenced by id (stored separately as Blobs).

export type GeneralId =
  | 'jandar'
  | 'utgar'
  | 'ullar'
  | 'vydar'
  | 'einar'
  | 'aquilla'
  | 'valkrill'
  | 'revna'
  | 'volarak'
  | 'custom'

export const GENERALS: { id: GeneralId; name: string; classic: boolean }[] = [
  { id: 'jandar', name: 'Jandar', classic: true },
  { id: 'utgar', name: 'Utgar', classic: true },
  { id: 'ullar', name: 'Ullar', classic: true },
  { id: 'vydar', name: 'Vydar', classic: true },
  { id: 'einar', name: 'Einar', classic: true },
  { id: 'aquilla', name: 'Aquilla', classic: true },
  { id: 'valkrill', name: 'Valkrill', classic: true },
  { id: 'revna', name: 'Revna', classic: false },
  { id: 'volarak', name: 'Volarak', classic: false },
  { id: 'custom', name: 'Custom', classic: true },
]

export type StyleId = 'aoa' | 'rotv' | 'sotm' | 'ds'

export const STYLES: { id: StyleId; name: string; hint: string }[] = [
  { id: 'aoa', name: 'Age of Annihilation (2024)', hint: 'Current Renegade design, drawn as vectors' },
  { id: 'rotv', name: 'Classic: Rise of the Valkyrie', hint: 'Original 2004 metal frame' },
  { id: 'sotm', name: 'Classic: Swarm of the Marro', hint: '2007 vine frame' },
  { id: 'ds', name: 'Classic: Dungeon set', hint: '2010 frame' },
]

export type Side = 'master' | 'basic'

export type SizeCategory = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge'
export const SIZE_CATEGORIES: SizeCategory[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge']

export const UNIT_TYPES = [
  'Unique Hero',
  'Common Hero',
  'Uncommon Hero',
  'Unique Squad',
  'Common Squad',
  'Uncommon Squad',
] as const
export type UnitType = (typeof UNIT_TYPES)[number]

export interface Power {
  id: string
  name: string
  text: string
}

export interface PortraitLayer {
  id: string
  imageId: string
  /** offset of the image centre from the window centre, in card units */
  x: number
  y: number
  /** image height as a fraction of the window height */
  scale: number
  flip: boolean
  rotation: number
}

export interface Backdrop {
  kind: 'general' | 'color' | 'image' | 'none'
  color: string
  imageId?: string
  imageX: number
  imageY: number
  imageScale: number
}

export interface BasicStats {
  move: number
  range: number
  attack: number
  defense: number
}

export interface Portrait {
  layers: PortraitLayer[]
  backdrop: Backdrop
  overflow: boolean
}

export interface TargetPoint {
  /** position as a fraction of the silhouette's width / height */
  x: number
  y: number
  /** radius in card units */
  r: number
}

export interface HitZoneItem {
  imageId: string
  /** green line-of-sight target point for this figure (null = hidden) */
  target: TargetPoint | null
  /** painted "cannot be targeted" (grey) mask in this silhouette's source pixel grid */
  paintImageId?: string
}

export interface HitZone {
  /** silhouettes shown in the box (one per squad figure, or a single hero) */
  items: HitZoneItem[]
  /** legacy single-figure fields (migrated into items[0]) */
  paintImageId?: string
  target?: TargetPoint | null
  x: number
  y: number
  /** silhouette height as a fraction of the panel height */
  scale: number
  flip: boolean
  /** fraction of the silhouette's bottom to trim off (removes the base) */
  trimBottom: number
  /** alpha threshold 0..255 */
  threshold: number
}

export interface CustomGeneral {
  name: string
  color: string
  emblemImageId?: string
}

export interface CardDesign {
  id: string
  version: 1
  style: StyleId
  general: GeneralId
  customGeneral: CustomGeneral
  unitName: string
  species: string
  unitType: UnitType
  unitClass: string
  personality: string
  sizeCategory: SizeCategory
  height: number
  life: number
  move: number
  range: number
  attack: number
  defense: number
  points: number
  /** Basic-game values printed on the Basic side (null = same as Master) */
  basicStats: BasicStats | null
  figuresInSquad: number
  powers: Power[]
  portrait: Portrait
  basicPortrait: Portrait & { sameAsMaster: boolean }
  hitZone: HitZone
  footer: { homeworld: string; setName: string; collection: string; credit: string }
  pronoun: 'he' | 'she' | 'it' | 'they'
  createdAt: number
  updatedAt: number
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function defaultBackdrop(): Backdrop {
  return { kind: 'general', color: '#7b8fa6', imageX: 0, imageY: 0, imageScale: 1 }
}

export function defaultTarget(): TargetPoint {
  return { x: 0.5, y: 0.12, r: 4.5 }
}

export function newHitZoneItem(imageId: string, target: TargetPoint | null = defaultTarget()): HitZoneItem {
  return { imageId, target: target ? { ...target } : null }
}

export function defaultHitZone(): HitZone {
  return {
    items: [],
    x: 0,
    y: 0,
    scale: 0.78,
    flip: false,
    trimBottom: 0,
    threshold: 128,
  }
}

export function newCard(partial: Partial<CardDesign> = {}): CardDesign {
  const now = Date.now()
  return {
    id: newId(),
    version: 1,
    style: 'aoa',
    general: 'jandar',
    customGeneral: { name: 'Custom', color: '#5a6b7c' },
    unitName: 'New Hero',
    species: 'Human',
    unitType: 'Unique Hero',
    unitClass: 'Warrior',
    personality: 'Valiant',
    sizeCategory: 'Medium',
    height: 5,
    life: 4,
    move: 5,
    range: 1,
    attack: 3,
    defense: 3,
    points: 80,
    basicStats: null,
    figuresInSquad: 3,
    powers: [
      {
        id: newId(),
        name: 'Special Power',
        text: 'Describe what this figure can do. Powers print in the order listed here.',
      },
    ],
    portrait: { layers: [], backdrop: defaultBackdrop(), overflow: true },
    basicPortrait: { layers: [], backdrop: defaultBackdrop(), overflow: true, sameAsMaster: true },
    hitZone: defaultHitZone(),
    footer: { homeworld: '', setName: '', collection: '', credit: '' },
    pronoun: 'he',
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

/** Stats to print on a given side. */
export function statsFor(d: CardDesign, side: Side): BasicStats {
  if (side === 'basic' && d.basicStats) return d.basicStats
  return { move: d.move, range: d.range, attack: d.attack, defense: d.defense }
}

/** Give the Basic side its own copy of the Master photo so it can be placed separately. */
export function splitBasicPortrait(d: CardDesign): CardDesign {
  if (!d.basicPortrait.sameAsMaster) return d
  return {
    ...d,
    basicPortrait: {
      sameAsMaster: false,
      overflow: d.portrait.overflow,
      backdrop: { ...d.portrait.backdrop },
      layers: d.portrait.layers.map((l) => ({ ...l })),
    },
  }
}

export function isSquad(d: CardDesign): boolean {
  return d.unitType.endsWith('Squad')
}

export function generalName(d: CardDesign): string {
  if (d.general === 'custom') return d.customGeneral.name || 'Custom'
  return GENERALS.find((g) => g.id === d.general)?.name ?? d.general
}

/** All image ids referenced by a design (for cleanup and export). */
export function imageIdsOf(d: CardDesign): string[] {
  const ids = new Set<string>()
  for (const l of d.portrait.layers) ids.add(l.imageId)
  for (const l of d.basicPortrait.layers) ids.add(l.imageId)
  if (d.portrait.backdrop.imageId) ids.add(d.portrait.backdrop.imageId)
  if (d.basicPortrait.backdrop.imageId) ids.add(d.basicPortrait.backdrop.imageId)
  for (const it of d.hitZone.items) {
    ids.add(it.imageId)
    if (it.paintImageId) ids.add(it.paintImageId)
  }
  if (d.hitZone.paintImageId) ids.add(d.hitZone.paintImageId)
  if (d.customGeneral.emblemImageId) ids.add(d.customGeneral.emblemImageId)
  return [...ids]
}

/** Upgrade / repair a design loaded from storage or an imported file. */
export function normalizeCard(raw: unknown): CardDesign {
  const base = newCard()
  const r = (raw ?? {}) as Partial<CardDesign> & Record<string, unknown>
  const hz = (r.hitZone ?? {}) as Partial<HitZone> & { imageId?: string; mode?: string; dots?: unknown }
  const legacyTarget: TargetPoint | null = hz.target === null ? null : { ...defaultTarget(), ...(hz.target ?? {}) }
  const rawItems: Partial<HitZoneItem>[] = Array.isArray(hz.items)
    ? hz.items.filter((i) => i && i.imageId)
    : hz.imageId
      ? [{ imageId: String(hz.imageId) }]
      : []
  const items: HitZoneItem[] = rawItems.map((i, idx) => ({
    imageId: String(i.imageId),
    target:
      i.target === null
        ? null
        : i.target
          ? { ...defaultTarget(), ...i.target }
          : idx === 0
            ? legacyTarget
            : defaultTarget(),
    paintImageId: i.paintImageId ?? (idx === 0 ? hz.paintImageId : undefined),
  }))
  const d: CardDesign = {
    ...base,
    ...r,
    customGeneral: { ...base.customGeneral, ...(r.customGeneral ?? {}) },
    portrait: normalizePortrait(r.portrait),
    basicPortrait: {
      ...normalizePortrait(r.basicPortrait),
      sameAsMaster: (r.basicPortrait as { sameAsMaster?: boolean } | undefined)?.sameAsMaster ?? true,
    },
    hitZone: {
      ...defaultHitZone(),
      ...hz,
      items,
      paintImageId: undefined,
      target: undefined,
    },
    footer: { ...base.footer, ...(r.footer ?? {}) },
    basicStats: r.basicStats
      ? {
          move: Number(r.basicStats.move ?? 0),
          range: Number(r.basicStats.range ?? 0),
          attack: Number(r.basicStats.attack ?? 0),
          defense: Number(r.basicStats.defense ?? 0),
        }
      : null,
    powers: Array.isArray(r.powers)
      ? r.powers.map((p) => ({ id: p.id || newId(), name: String(p.name ?? ''), text: String(p.text ?? '') }))
      : base.powers,
  }
  if (!GENERALS.some((g) => g.id === d.general)) d.general = 'custom'
  if (!STYLES.some((s) => s.id === d.style)) d.style = 'aoa'
  if (!d.id) d.id = newId()
  d.version = 1
  return d
}

function normalizePortrait(p: unknown): Portrait {
  const src = (p ?? {}) as Partial<Portrait>
  return {
    layers: (src.layers ?? []).map(normalizeLayer),
    backdrop: { ...defaultBackdrop(), ...(src.backdrop ?? {}) },
    overflow: src.overflow ?? true,
  }
}

function normalizeLayer(l: Partial<PortraitLayer>): PortraitLayer {
  return {
    id: l.id || newId(),
    imageId: String(l.imageId),
    x: Number(l.x ?? 0),
    y: Number(l.y ?? 0),
    scale: Number(l.scale ?? 0.9),
    flip: Boolean(l.flip),
    rotation: Number(l.rotation ?? 0),
  }
}

/** Compact official-unit preset row (see src/data/presets.json). */
export interface Preset {
  n: string
  g: string
  gn: string
  grp: string
  set: string
  hw: string
  sp: string
  cl: string
  pe: string
  sz: string
  ht: number
  li: number
  mv: number
  rg: number
  at: number
  df: number
  pt: number
  ty: string
  fig: number
  pw: { name: string; text: string }[]
}

export function applyPreset(d: CardDesign, p: Preset): CardDesign {
  const general = (GENERALS.some((g) => g.id === p.g) ? p.g : 'custom') as GeneralId
  const sizeCategory = (SIZE_CATEGORIES.includes(p.sz as SizeCategory) ? p.sz : 'Medium') as SizeCategory
  const unitType = (UNIT_TYPES.includes(p.ty as UnitType) ? p.ty : 'Unique Hero') as UnitType
  return {
    ...d,
    general,
    customGeneral: general === 'custom' ? { ...d.customGeneral, name: p.gn || 'Custom' } : d.customGeneral,
    unitName: p.n,
    species: p.sp,
    unitType,
    unitClass: p.cl,
    personality: p.pe,
    sizeCategory,
    height: p.ht,
    life: p.li,
    move: p.mv,
    range: p.rg,
    attack: p.at,
    defense: p.df,
    points: p.pt,
    figuresInSquad: p.fig || 1,
    powers: p.pw.length ? p.pw.map((pw) => ({ id: newId(), name: pw.name, text: pw.text })) : d.powers,
    footer: { ...d.footer, homeworld: p.hw, setName: p.set },
    updatedAt: Date.now(),
  }
}
