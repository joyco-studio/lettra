import { describe, expect, it } from 'vitest'
import { layout } from '../layout'
import { parseFont } from '../parse'
import miniFont from './fixtures/mini-font.json'

/* mini-font: size 10, lineHeight 12, base 9. Advances: H=10 a=7 v=7 A=9 V=9
 * ?=8 space=5 m=10 .=4. Kerning: AV=-4 Va=-2 av=-1. All xoffsets are 0. */
const font = parseFont(miniFont)

describe('layout', () => {
  it('applies pairwise kerning to the pen', () => {
    const kerned = layout(font, 'AV')
    const unkerned = layout(font, 'AA')
    // A advances 9, kern(AV) = -4, so V's quad sits at x = 5 instead of 9
    expect(kerned.glyphs[1].x).toBe(5)
    expect(unkerned.glyphs[1].x).toBe(9)
    expect(kerned.width).toBe(5 + 8)
    expect(unkerned.width).toBe(9 + 8)
  })

  it('accumulates letter-spacing into the advance', () => {
    const result = layout(font, 'Ha', { letterSpacing: 2 })
    expect(result.glyphs[1].x).toBe(12)
    expect(result.width).toBe(18)
  })

  it('advances past spaces without emitting quads', () => {
    const result = layout(font, 'H H')
    expect(result.glyphs).toHaveLength(2)
    expect(result.glyphs[1].x).toBe(15)
  })

  it('expands tabs to tabSize space advances', () => {
    const result = layout(font, 'H\tH')
    expect(result.glyphs[1].x).toBe(10 + 4 * 5)
    expect(layout(font, 'H\tH', { tabSize: 2 }).glyphs[1].x).toBe(10 + 2 * 5)
  })

  it('aligns lines against the widest line', () => {
    // line widths: 'H' = 8, 'HH' = 18
    const centered = layout(font, 'H\nHH', { align: 'center' })
    expect(centered.glyphs[0].x).toBe(5)
    const right = layout(font, 'H\nHH', { align: 'right' })
    expect(right.glyphs[0].x).toBe(10)
  })

  it('steps lines by lineHeight, overridable', () => {
    // H yoffset = 1
    expect(layout(font, 'H\nH').glyphs[1].y).toBe(12 + 1)
    expect(layout(font, 'H\nH', { lineHeight: 20 }).glyphs[1].y).toBe(20 + 1)
  })

  it('wraps greedily at maxWidth and records line indices', () => {
    // 'HH' spans pen 20 / ink 18; a space would push the pen to 25
    const result = layout(font, 'HH HH HH', { maxWidth: 25 })
    expect(result.metrics.lineCount).toBe(3)
    const byLine = result.glyphs.map((g) => [g.index, g.line])
    expect(byLine).toEqual([
      [0, 0],
      [1, 0],
      [3, 1],
      [4, 1],
      [6, 2],
      [7, 2],
    ])
  })

  it('reports ink bounds, not font metrics', () => {
    // '.' is a 2×2 quad at yoffset 7 — metric height would be 9
    const result = layout(font, '.')
    expect(result.width).toBe(2)
    expect(result.height).toBe(2)
    expect(result.inkOrigin).toEqual({ x: 0, y: 7 })
    expect(result.metrics.metricHeight).toBe(9)
    expect(result.metrics.metricWidth).toBe(2)
  })

  it('computes y-down atlas UV ratios per glyph', () => {
    const h = layout(font, 'H').glyphs[0]
    expect([h.u0, h.v0, h.u1, h.v1]).toEqual([0, 0, 0.08, 0.08])
  })

  it('substitutes ? for characters missing from the charset', () => {
    const result = layout(font, '→')
    expect(result.glyphs).toHaveLength(1)
    expect(result.glyphs[0].char).toBe('→')
    // uv points at the '?' glyph (x = 50 in a 100px atlas)
    expect(result.glyphs[0].u0).toBe(0.5)
  })

  it('handles the empty string without throwing', () => {
    const result = layout(font, '')
    expect(result.glyphs).toEqual([])
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
    expect(result.metrics.lineCount).toBe(0)
  })

  it('handles whitespace-only text as ink-less', () => {
    const result = layout(font, '   ')
    expect(result.glyphs).toEqual([])
    expect(result.width).toBe(0)
  })
})
