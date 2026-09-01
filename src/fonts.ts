// Self-hosted fonts loaded through the FontFace API so canvas text is
// guaranteed to use them (canvas never re-renders when a font arrives late).
//
// Stand-ins for the card typefaces: the 2024 cards use a geometric condensed
// face for names/labels and a semi-condensed humanist sans for body text; the
// classic cards used Helvetica Neue Condensed throughout.

export const FONT_COND = 'Barlow Condensed'
export const FONT_BODY = 'Barlow Semi Condensed'
export const FONT_GEO = 'Saira Condensed'

const BASE = import.meta.env.BASE_URL + 'fonts/'

const FILES: [family: string, file: string, weight: string][] = [
  [FONT_COND, 'barlow-condensed-v13-latin-500.woff2', '500'],
  [FONT_COND, 'barlow-condensed-v13-latin-600.woff2', '600'],
  [FONT_COND, 'barlow-condensed-v13-latin-700.woff2', '700'],
  [FONT_BODY, 'barlow-semi-condensed-v16-latin-regular.woff2', '400'],
  [FONT_BODY, 'barlow-semi-condensed-v16-latin-500.woff2', '500'],
  [FONT_BODY, 'barlow-semi-condensed-v16-latin-600.woff2', '600'],
  [FONT_GEO, 'saira-condensed-v12-latin-500.woff2', '500'],
  [FONT_GEO, 'saira-condensed-v12-latin-600.woff2', '600'],
  [FONT_GEO, 'saira-condensed-v12-latin-700.woff2', '700'],
]

let loading: Promise<void> | null = null

export function loadFonts(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    if (typeof FontFace === 'undefined') return
    await Promise.all(
      FILES.map(async ([family, file, weight]) => {
        try {
          const face = new FontFace(family, `url(${BASE}${file})`, { weight, style: 'normal' })
          await face.load()
          document.fonts.add(face)
        } catch (err) {
          console.warn('font failed', family, weight, err)
        }
      }),
    )
    try {
      await document.fonts.ready
    } catch {
      /* ignore */
    }
  })()
  return loading
}

export function font(weight: number | string, size: number, family: string): string {
  return `${weight} ${size}px "${family}", "Arial Narrow", Arial, sans-serif`
}
