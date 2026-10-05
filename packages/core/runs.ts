/* EXPERIMENTAL: one paragraph, several fonts. Wrapping is whole-paragraph,
 * kerning drops at run boundaries, mixed bake sizes normalize to the first
 * run's font, and baselines align to the deepest normalized base. */

import { createGlyphResolver, createPenMeasure, placeLines } from './layout'
import type { PenHooks } from './layout'
import { getFontLookup } from './parse'
import { wrapLines } from './wrap'
import type { LayoutGlyph, LayoutMetrics, LayoutOptions, MSDFFont } from './types'

export interface LayoutRun {
  font: MSDFFont
  /** [start, end) in the shared text. Runs must tile the string, in order. */
  start: number
  end: number
}

export interface RunsLayoutResult {
  /** Input order; glyphs carry global `index` and `line`. */
  runs: Array<{ run: number; glyphs: LayoutGlyph[] }>
  width: number
  height: number
  inkOrigin: { x: number; y: number }
  /** fontSize is the first run's — the normalization reference. */
  metrics: LayoutMetrics
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

/** One pen, wrap pass and line grid across runs. Coordinates come out in the
 * first run font's layout px. */
export function experimental_layoutRuns(text: string, runs: LayoutRun[], opts: LayoutOptions = {}): RunsLayoutResult {
  if (runs.length === 0) fail('layoutRuns requires at least one run')
  let cursor = 0
  for (const run of runs) {
    if (run.start !== cursor || run.end < run.start) fail('runs must tile the text contiguously and in order')
    cursor = run.end
  }
  if (cursor !== text.length) fail(`runs cover [0, ${cursor}) but the text has length ${text.length}`)

  const letterSpacing = opts.letterSpacing ?? 0
  const align = opts.align ?? 'left'
  const tabSize = opts.tabSize ?? 4
  const mode = opts.mode ?? (opts.maxWidth !== undefined ? 'greedy' : 'nowrap')

  const refSize = runs[0].font.size
  const scales = runs.map((run) => refSize / run.font.size)
  const resolvers = runs.map((run) => createGlyphResolver(run.font, tabSize))
  const kernings = runs.map((run) => getFontLookup(run.font).kerning)
  // deepest baseline so mixed faces sit on one line
  const baseline = Math.max(...runs.map((run, r) => run.font.base * scales[r]))
  const lineHeight = opts.lineHeight ?? Math.max(...runs.map((run, r) => run.font.lineHeight * scales[r]))
  const yShifts = runs.map((run, r) => baseline - run.font.base * scales[r])

  const runOf = new Array<number>(text.length)
  runs.forEach((run, r) => {
    for (let i = run.start; i < run.end; i++) runOf[i] = r
  })

  const hooks: PenHooks = {
    resolveAt: (index, char) => resolvers[runOf[index]](char),
    kernAt: (prevIndex, index, left, right) => {
      const r = runOf[index]
      // cross-boundary pairs don't kern: the pair tables are per-font
      if (runOf[prevIndex] !== r) return 0
      return (kernings[r].get(left.char + right.char) ?? 0) * scales[r]
    },
    scaleAt: (index) => scales[runOf[index]],
    atlasAt: (index) => runs[runOf[index]].font.atlas,
    yShiftAt: (index) => yShifts[runOf[index]],
  }

  const measure = createPenMeasure(hooks, letterSpacing)
  const lines = wrapLines(text, { width: opts.maxWidth, mode, measure })

  const buckets: LayoutGlyph[][] = runs.map(() => [])
  const placed = placeLines(text, lines, hooks, { letterSpacing, lineHeight, align }, (glyph) =>
    buckets[runOf[glyph.index]].push(glyph)
  )

  const { hasInk } = placed
  return {
    runs: buckets.map((glyphs, run) => ({ run, glyphs })),
    width: hasInk ? placed.maxX - placed.minX : 0,
    height: hasInk ? placed.maxY - placed.minY : 0,
    inkOrigin: { x: hasInk ? placed.minX : 0, y: hasInk ? placed.minY : 0 },
    metrics: {
      fontSize: refSize,
      lineCount: lines.length,
      lineHeight,
      baseline,
      metricWidth: placed.maxLineWidth,
      metricHeight: lines.length > 0 ? lineHeight * lines.length - (lineHeight - baseline) : 0,
    },
  }
}
