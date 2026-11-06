/* Where a caret can stand in text laid out by `layoutRuns`, and which offset a
 * point falls on. The layout emits quads only for visible glyphs (no spaces,
 * no line ranges), so this walks the same pen (`createRunPen`, the hooks and
 * wrap `layoutRuns` draws with) and keeps what the quads throw away: the pen x
 * before every character and the ranges of every line. Alignment and tabs
 * come along for free, since it is the drawing pen.
 *
 * Coordinates are layout px of the reference run font, y-down, first line top
 * at 0: the space `layoutRuns` emits glyphs in. */

import { createRunPen } from './runs'
import type { LayoutRun } from './runs'
import type { Glyph, LayoutOptions } from './types'

export interface CaretLine {
  /** First offset drawn on this line (leading spaces a wrap skipped come before it). */
  start: number
  /** Offset after the last character drawn on this line (trailing spaces a wrap trimmed come after it). */
  end: number
  /** First offset that belongs to this line: where the previous line's trimmed spaces end. */
  from: number
  /** Last offset that belongs to this line. A wrapped line owns its trimmed spaces, so a caret after them still sits at its end. */
  to: number
}

export interface CaretStop {
  x: number
  line: number
}

export interface CaretLayout {
  /** One per offset, `text.length + 1` long. */
  stops: CaretStop[]
  lines: CaretLine[]
  lineHeight: number
  /** Line top → baseline. */
  baseline: number
  /** Line top → the bottom of its letters (the fonts' own line box, whatever
   * line height the layout sets). A line height under it overlaps the lines,
   * and the last line's letters hang below its box. */
  reach: number
}

/** A caret position: a block of a document, and an offset in its text. */
export interface TextPoint {
  block: number
  offset: number
}

/** `anchor` stays where the selection started, `head` moves with the caret; equal when collapsed. */
export interface TextSelection {
  anchor: TextPoint
  head: TextPoint
}

export function caretLayout(text: string, runs: LayoutRun[], opts: LayoutOptions = {}): CaretLayout {
  const {
    hooks,
    lines: wrapped,
    baseline,
    lineHeight,
    fontLineHeight,
    letterSpacing,
    align,
  } = createRunPen(text, runs, opts)
  const drawn = wrapped.length ? wrapped : [{ start: text.length, end: text.length, width: 0 }]
  const maxLineWidth = Math.max(0, ...drawn.map((line) => line.width))

  // the spaces a wrap trimmed off a line's end stay on it (a caret after them
  // sits at its end); the next line owns its own first offset, so a hard wrap
  // inside a long word puts the shared offset at the start of the later line
  const lines: CaretLine[] = drawn.map((line, index) => ({
    start: line.start,
    end: line.end,
    from: index === 0 ? 0 : line.start,
    to: index === drawn.length - 1 ? text.length : drawn[index + 1].start - 1,
  }))

  const stops: CaretStop[] = Array.from({ length: text.length + 1 }, () => ({ x: 0, line: 0 }))
  lines.forEach((line, index) => {
    // the alignment offset placeLines gives the same line
    const width = drawn[index].width
    const alignOffset = align === 'center' ? (maxLineWidth - width) / 2 : align === 'right' ? maxLineWidth - width : 0
    let x = 0
    let last: Glyph | null = null
    let lastIndex = -1
    for (let i = line.from; i < line.start; i++) stops[i] = { x: alignOffset, line: index }
    for (let i = line.start; i < line.end; i++) {
      const glyph = hooks.resolveAt(i, text.charAt(i))
      if (glyph && last) x += hooks.kernAt(lastIndex, i, last, glyph)
      stops[i] = { x: x + alignOffset, line: index }
      if (!glyph) continue
      x += glyph.xadvance * hooks.scaleAt(i) + letterSpacing
      last = glyph
      lastIndex = i
    }
    for (let i = line.end; i <= line.to; i++) stops[i] = { x: x + alignOffset, line: index }
  })
  return { stops, lines, lineHeight, baseline, reach: fontLineHeight }
}

/** The offset nearest `(x, y)` (layout px, y-down): the line under y, then the closest caret stop on it. */
export function hitTest(layout: CaretLayout, x: number, y: number): number {
  const line = Math.max(0, Math.min(layout.lines.length - 1, Math.floor(y / layout.lineHeight)))
  return nearestOnLine(layout, line, x)
}

/** The offset on `line` whose caret stop is closest to `x`. */
export function nearestOnLine(layout: CaretLayout, line: number, x: number): number {
  const { from, to } = layout.lines[line]
  let best = from
  let distance = Infinity
  for (let offset = from; offset <= to; offset++) {
    const stop = layout.stops[offset]
    if (stop.line !== line) continue
    const gap = Math.abs(stop.x - x)
    if (gap < distance) {
      distance = gap
      best = offset
    }
  }
  return best
}

/** The offset one line up (`-1`) or down (`1`) from `offset`, keeping `goalX`;
 * undefined when that leaves the text, so the caller carries on into the
 * block above or below. */
export function verticalMove(layout: CaretLayout, offset: number, direction: -1 | 1, goalX: number) {
  const line = layout.stops[offset].line + direction
  if (line < 0 || line >= layout.lines.length) return undefined
  return nearestOnLine(layout, line, goalX)
}

/** The first or last offset on `offset`'s line, for Home and End. */
export function lineEdge(layout: CaretLayout, offset: number, edge: 'start' | 'end'): number {
  const line = layout.lines[layout.stops[offset].line]
  return edge === 'start' ? line.from : Math.min(line.end, line.to)
}

const WORD = /[\p{L}\p{N}'’]/u

/** The word around `offset`, for a double click: [start, end), empty between two spaces. */
export function wordAt(text: string, offset: number): [number, number] {
  let start = offset
  let end = offset
  while (start > 0 && WORD.test(text.charAt(start - 1))) start--
  while (end < text.length && WORD.test(text.charAt(end))) end++
  return [start, end]
}

/** The sentence around `offset`, for a triple click: from after the last full stop (or the start) to after the next. */
export function sentenceAt(text: string, offset: number): [number, number] {
  const ends = /[.!?…]+["'”’)]*\s*/g
  let start = 0
  for (let match = ends.exec(text); match; match = ends.exec(text)) {
    const after = match.index + match[0].length
    if (after > offset || after >= text.length) {
      // the sentence ends at its stop, not at the spaces after it
      return [start, match.index + match[0].trimEnd().length]
    }
    start = after
  }
  return [start, text.length]
}
