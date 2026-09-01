// Canvas text layout helpers: wrapping, shrink-to-fit, letter spacing.

export function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w
    if (ctx.measureText(test).width <= maxWidth || !cur) {
      cur = test
      // a single word longer than the line: hard-break it
      while (ctx.measureText(cur).width > maxWidth && cur.length > 1) {
        let cut = cur.length - 1
        while (cut > 1 && ctx.measureText(cur.slice(0, cut)).width > maxWidth) cut--
        lines.push(cur.slice(0, cut))
        cur = cur.slice(cut)
      }
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.replace(/\r/g, '').split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    out.push(...wrapLine(ctx, para, maxWidth))
  }
  return out
}

export interface FitOptions {
  maxWidth: number
  maxHeight: number
  size: number
  minSize: number
  lineHeight: number // multiple of size
  maxLines?: number
  fontFor: (size: number) => string
}

/** Pick the largest font size (down to minSize) at which the text fits. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  o: FitOptions,
): { size: number; lines: string[]; lineHeight: number } {
  let size = o.size
  for (;;) {
    ctx.font = o.fontFor(size)
    const lines = wrapText(ctx, text, o.maxWidth)
    const lh = size * o.lineHeight
    const okLines = o.maxLines ? lines.length <= o.maxLines : true
    if ((lines.length * lh <= o.maxHeight && okLines) || size <= o.minSize) {
      return { size, lines, lineHeight: lh }
    }
    size = Math.max(o.minSize, size - Math.max(0.5, size * 0.04))
  }
}

/** Single-line shrink to width. Returns the font size used. */
export function fitSingleLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  minSize: number,
  fontFor: (s: number) => string,
): number {
  let s = size
  ctx.font = fontFor(s)
  while (ctx.measureText(text).width > maxWidth && s > minSize) {
    s = Math.max(minSize, s - Math.max(0.5, s * 0.04))
    ctx.font = fontFor(s)
  }
  return s
}

/** Draw text with manual letter spacing (works in every browser). */
export function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const chars = [...text]
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1)
  let cx = x
  if (align === 'center') cx = x - total / 2
  else if (align === 'right') cx = x - total
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y)
    cx += widths[i] + spacing
  })
  ctx.textAlign = prevAlign
}

export function measureSpaced(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  const chars = [...text]
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1)
}
