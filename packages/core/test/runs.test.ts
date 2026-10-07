import { describe, expect, it } from 'vitest'
import { layout } from '../layout'
import { parseFont } from '../parse'
import { layoutRuns } from '../runs'
import type { MSDFFont } from '../types'
import miniFont from './fixtures/mini-font.json'

/* mini-font: size 10, lineHeight 12, base 9. Advances: H=10 A=9 V=9 space=5.
 * Kerning: AV=-4. All xoffsets 0, H yoffset 1. */
const mini = parseFont(miniFont)

/* Same shapes as mini baked at 2× (size 20): every metric doubles, so after
 * normalization to mini it lays out identically — scale math is observable. */
const big: MSDFFont = {
  name: 'big',
  size: 20,
  lineHeight: 24,
  base: 18,
  distanceRange: 8,
  atlas: { width: 200, height: 200 },
  glyphs: {
    H: [0, 0, 16, 16, 0, 2, 20],
    A: [60, 0, 16, 16, 0, 2, 18],
    V: [80, 0, 16, 16, 0, 2, 18],
    '?': [100, 0, 12, 16, 0, 2, 16],
    ' ': [0, 0, 0, 0, 0, 0, 10],
  },
  kerning: { AV: -8 },
}

/* Same size as mini but a shallower baseline (base 5) — alignment fixture. */
const shallow: MSDFFont = {
  ...mini,
  name: 'shallow',
  base: 5,
  glyphs: mini.glyphs,
  kerning: mini.kerning,
}

describe('layoutRuns', () => {
  it('matches layout() glyph-for-glyph with a single run', () => {
    const single = layout(mini, 'HH HH HH', { maxWidth: 25 })
    const runs = layoutRuns('HH HH HH', [{ font: mini, start: 0, end: 8 }], { maxWidth: 25 })
    expect(runs.runs[0].glyphs).toEqual(single.glyphs)
    expect(runs.width).toBe(single.width)
    expect(runs.metrics).toEqual(single.metrics)
  })

  it('wraps on whole-paragraph width across a run boundary', () => {
    const single = layout(mini, 'HH HH HH', { maxWidth: 25 })
    const result = layoutRuns(
      'HH HH HH',
      [
        { font: mini, start: 0, end: 4 },
        { font: mini, start: 4, end: 8 },
      ],
      { maxWidth: 25 }
    )
    const glyphs = result.runs.flatMap((bucket) => bucket.glyphs)
    expect(glyphs.map((g) => [g.index, g.line])).toEqual(single.glyphs.map((g) => [g.index, g.line]))
  })

  it('kerns within a run but drops pairs across the boundary', () => {
    const together = layoutRuns('AV', [{ font: mini, start: 0, end: 2 }])
    expect(together.runs[0].glyphs[1].x).toBe(5) // 9 advance + AV kern -4
    const split = layoutRuns('AV', [
      { font: mini, start: 0, end: 1 },
      { font: mini, start: 1, end: 2 },
    ])
    expect(split.runs[1].glyphs[0].x).toBe(9)
  })

  it('normalizes mixed bake sizes to the first run font', () => {
    const result = layoutRuns('HH', [
      { font: mini, start: 0, end: 1 },
      { font: big, start: 1, end: 2 },
    ])
    const bigGlyph = result.runs[1].glyphs[0]
    expect(bigGlyph.x).toBe(10) // mini H advance, unscaled
    expect(bigGlyph.w).toBe(8) // 16 × (10 / 20)
    expect(bigGlyph.y).toBe(1) // (yoffset 2) × 0.5, bases align exactly
    expect(result.metrics.fontSize).toBe(10)
  })

  it('aligns shallower baselines down to the deepest run', () => {
    const result = layoutRuns('HH', [
      { font: mini, start: 0, end: 1 },
      { font: shallow, start: 1, end: 2 },
    ])
    expect(result.metrics.baseline).toBe(9)
    expect(result.runs[0].glyphs[0].y).toBe(1)
    expect(result.runs[1].glyphs[0].y).toBe(5) // yoffset 1 + (9 − 5) shift
  })

  it('keeps global index and line continuity across buckets', () => {
    const result = layoutRuns(
      'HH HH',
      [
        { font: mini, start: 0, end: 3 },
        { font: mini, start: 3, end: 5 },
      ],
      { maxWidth: 25 }
    )
    const indices = result.runs.flatMap((bucket) => bucket.glyphs.map((g) => g.index))
    expect(indices).toEqual([0, 1, 3, 4])
    expect(result.runs[1].glyphs.every((g) => g.line === 1)).toBe(true)
  })

  it('rejects runs that do not tile the text', () => {
    expect(() => layoutRuns('HH', [{ font: mini, start: 0, end: 1 }])).toThrow(/length/)
    expect(() =>
      layoutRuns('HH', [
        { font: mini, start: 1, end: 2 },
        { font: mini, start: 0, end: 1 },
      ])
    ).toThrow(/contiguously/)
    expect(() => layoutRuns('H', [])).toThrow(/at least one run/)
  })
})
