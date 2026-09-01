// Colour palettes per General for the Age of Annihilation frame.
// Border/panel values were sampled from official Renegade renders; the
// "official" swatch is the hex colour Renegade's own card database publishes.
import type { CardDesign, GeneralId } from '../model'

export interface Palette {
  official: string
  border: string
  borderDark: string
  panelTop: string
  panelBottom: string
  hzTop: string
  hzBottom: string
  backdropTop: string
  backdropBottom: string
  backdropGlow: string
  ground: string
}

export const PALETTES: Record<Exclude<GeneralId, 'custom'>, Palette> = {
  jandar: {
    official: '#247bbe',
    border: '#2577bb',
    borderDark: '#154a78',
    panelTop: '#0a3d6a',
    panelBottom: '#0f5290',
    hzTop: '#9db4c4',
    hzBottom: '#5c7486',
    backdropTop: '#a9c9e6',
    backdropBottom: '#3b6f9e',
    backdropGlow: '#eaf4fc',
    ground: '#6f8f5c',
  },
  utgar: {
    official: '#991520',
    border: '#c5191e',
    borderDark: '#7a0f13',
    panelTop: '#4e0f11',
    panelBottom: '#7a1a1c',
    hzTop: '#5a2a24',
    hzBottom: '#1d0b09',
    backdropTop: '#c96a4a',
    backdropBottom: '#3a1210',
    backdropGlow: '#f6c6a2',
    ground: '#4a2a22',
  },
  ullar: {
    official: '#6c8b48',
    border: '#3f704d',
    borderDark: '#24452d',
    panelTop: '#10301a',
    panelBottom: '#1e4d2a',
    hzTop: '#3e5a44',
    hzBottom: '#14241a',
    backdropTop: '#8fbf8a',
    backdropBottom: '#1f4a2a',
    backdropGlow: '#e0f2d8',
    ground: '#3f6a3a',
  },
  vydar: {
    official: '#79989a',
    border: '#7996a7',
    borderDark: '#4b5f6b',
    panelTop: '#4a4f54',
    panelBottom: '#666a70',
    hzTop: '#5a6672',
    hzBottom: '#232a31',
    backdropTop: '#a7b7c4',
    backdropBottom: '#3a4a56',
    backdropGlow: '#eef3f7',
    ground: '#5a6068',
  },
  einar: {
    official: '#834d9d',
    border: '#622064',
    borderDark: '#3d1240',
    panelTop: '#5a2f70',
    panelBottom: '#834d9d',
    hzTop: '#4a2c58',
    hzBottom: '#1a0d20',
    backdropTop: '#c8a3d8',
    backdropBottom: '#3d1c4c',
    backdropGlow: '#f3e4f8',
    ground: '#5a4a3a',
  },
  aquilla: {
    official: '#d9b628',
    border: '#d8b627',
    borderDark: '#8f7614',
    panelTop: '#1d2740',
    panelBottom: '#2f3d5c',
    hzTop: '#3a4560',
    hzBottom: '#141a2a',
    backdropTop: '#e9d27a',
    backdropBottom: '#4a3a1a',
    backdropGlow: '#fff5cc',
    ground: '#6a5a2a',
  },
  valkrill: {
    official: '#826c5c',
    border: '#8a6f5a',
    borderDark: '#4f3e32',
    panelTop: '#3a2a1e',
    panelBottom: '#5a4433',
    hzTop: '#4a3a2e',
    hzBottom: '#1a120c',
    backdropTop: '#b89a7a',
    backdropBottom: '#3a2a1c',
    backdropGlow: '#f2e4d2',
    ground: '#4a3a2a',
  },
  revna: {
    official: '#cec7aa',
    border: '#cac4a6',
    borderDark: '#8a8468',
    panelTop: '#5e5540',
    panelBottom: '#7a6f52',
    hzTop: '#7a7460',
    hzBottom: '#2f2b20',
    backdropTop: '#d9d3b8',
    backdropBottom: '#5a5340',
    backdropGlow: '#fbf8ec',
    ground: '#7a6f52',
  },
  volarak: {
    official: '#878d39',
    border: '#97ae3b',
    borderDark: '#5c6b1f',
    panelTop: '#566214',
    panelBottom: '#6d7c22',
    hzTop: '#5a6a3a',
    hzBottom: '#1f2612',
    backdropTop: '#c9d68a',
    backdropBottom: '#3d4a18',
    backdropGlow: '#f4f8d8',
    ground: '#556a2a',
  },
}

export function paletteFor(d: CardDesign): Palette {
  if (d.general !== 'custom') return PALETTES[d.general]
  return derivePalette(d.customGeneral.color || '#5a6b7c')
}

export function derivePalette(hex: string): Palette {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex))
  const c = (ll: number, ss = s) => hslToHex(h, Math.min(1, ss), ll)
  return {
    official: hex,
    border: hex,
    borderDark: c(Math.max(0.08, l * 0.6)),
    panelTop: c(0.18, s * 1.05),
    panelBottom: c(0.28, s * 1.05),
    hzTop: c(0.32, s * 0.5),
    hzBottom: c(0.1, s * 0.6),
    backdropTop: c(0.72, s * 0.7),
    backdropBottom: c(0.24, s * 0.8),
    backdropGlow: c(0.94, s * 0.4),
    ground: c(0.3, s * 0.5),
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const v = m.length === 3 ? m.split('').map((ch) => ch + ch).join('') : m.padEnd(6, '0')
  const n = parseInt(v.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  let h = 0,
    s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) r = g = b = l
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function hexA(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export function shade(hex: string, amt: number): string {
  let [r, g, b] = hexToRgb(hex)
  if (amt < 0) {
    r = Math.round(r * (1 + amt))
    g = Math.round(g * (1 + amt))
    b = Math.round(b * (1 + amt))
  } else {
    r = Math.round(r + (255 - r) * amt)
    g = Math.round(g + (255 - g) * amt)
    b = Math.round(b + (255 - b) * amt)
  }
  return `rgb(${r},${g},${b})`
}

export const STAT_COLORS = {
  move: '#2f5733',
  range: '#484441',
  attack: '#661b2b',
  defense: '#164273',
  life: '#c81e28',
  hitZoneGray: '#8c8c8c',
  hitZoneRed: '#ca2027',
  target: '#3cd23c',
  parchment: '#f3efdf',
  plaqueLight: '#9c9c9c',
  plaqueDark: '#4f4f4f',
  ink: '#1e1b17',
}
