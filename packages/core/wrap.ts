/* Typed port of word-wrapper (Jam3, MIT, https://github.com/Jam3/word-wrapper).
 * Vendored instead of depended on — the original is untouched since 2017. */

import type { WrapMode } from './types'

export interface WrappedLine {
  start: number
  end: number
  width: number
}

/** Measures how much of text[start..end) fits into `width`, returning the
 * consumed range and its rendered width. */
export type MeasureFn = (text: string, start: number, end: number, width: number) => WrappedLine

export interface WrapOptions {
  width?: number
  mode?: WrapMode
  start?: number
  end?: number
  measure?: MeasureFn
}

const NEWLINE = '\n'
const WHITESPACE = /\s/

/** Character-count measure used when no font measure is supplied. */
const monospace: MeasureFn = (_text, start, end, width) => {
  const glyphs = Math.min(width, end - start)
  return { start, end: start + glyphs, width: glyphs }
}

export function wrapLines(text: string, opts: WrapOptions = {}): WrappedLine[] {
  if (opts.width === 0 && opts.mode !== 'nowrap') return []
  const width = typeof opts.width === 'number' ? opts.width : Number.MAX_VALUE
  const start = Math.max(0, opts.start ?? 0)
  const end = typeof opts.end === 'number' ? opts.end : text.length
  const measure = opts.measure ?? monospace

  if (opts.mode === 'pre') return pre(measure, text, start, end, width)
  return greedy(measure, text, start, end, width, opts.mode)
}

function indexOfNewline(text: string, start: number, end: number): number {
  const idx = text.indexOf(NEWLINE, start)
  if (idx === -1 || idx > end) return end
  return idx
}

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char)
}

function pre(measure: MeasureFn, text: string, start: number, end: number, width: number): WrappedLine[] {
  const lines: WrappedLine[] = []
  let lineStart = start
  for (let i = start; i < end && i < text.length; i++) {
    const isNewline = text.charAt(i) === NEWLINE
    if (isNewline || i === end - 1) {
      const lineEnd = isNewline ? i : i + 1
      lines.push(measure(text, lineStart, lineEnd, width))
      lineStart = i + 1
    }
  }
  return lines
}

function greedy(
  measure: MeasureFn,
  text: string,
  start: number,
  end: number,
  width: number,
  mode?: WrapMode
): WrappedLine[] {
  const lines: WrappedLine[] = []
  const testWidth = mode === 'nowrap' ? Number.MAX_VALUE : width

  while (start < end && start < text.length) {
    const newline = indexOfNewline(text, start, end)

    // eat leading whitespace
    while (start < newline && isWhitespace(text.charAt(start))) start++

    const measured = measure(text, start, newline, testWidth)
    let lineEnd = start + (measured.end - measured.start)
    let nextStart = lineEnd + NEWLINE.length

    if (lineEnd < newline) {
      // walk back to the last whitespace — the break point
      while (lineEnd > start && !isWhitespace(text.charAt(lineEnd))) lineEnd--
      if (lineEnd === start) {
        // unbreakable word wider than the line: hard-break at the measured end
        if (nextStart > start + NEWLINE.length) nextStart--
        lineEnd = nextStart
      } else {
        nextStart = lineEnd
        // eat trailing whitespace
        while (lineEnd > start && isWhitespace(text.charAt(lineEnd - NEWLINE.length))) lineEnd--
      }
    }

    if (lineEnd >= start) lines.push(measure(text, start, lineEnd, testWidth))
    start = nextStart
  }

  return lines
}
