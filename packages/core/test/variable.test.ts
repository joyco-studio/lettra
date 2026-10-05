import { describe, expect, it } from 'vitest'
import { layout } from '../layout'
import { parseFont } from '../parse'
import { experimental_interpolateFont, isVariableFont, weightToT } from '../variable'
import miniFont from './fixtures/mini-font.json'
import miniVariableFont from './fixtures/mini-variable-font.json'

/* mini-vf: size 10, base 9, lineHeight 12, weightRange [300, 800].
 * H = advance 10, deltas [Δxoff 1, Δyoff -1, Δxadv 2]; a = advance 7, Δxadv 1.
 * Kerning AV = -4 with Δ+2; Ha kerns only via delta (-1). metricsDelta [4, 2]. */
const font = parseFont(miniVariableFont)

describe('variable fonts', () => {
  it('detects delta-channel bakes', () => {
    expect(isVariableFont(font)).toBe(true)
    expect(isVariableFont(parseFont(miniFont))).toBe(false)
  })

  it('maps weight onto the range as clamped t', () => {
    expect(weightToT(font, 300)).toBe(0)
    expect(weightToT(font, 800)).toBe(1)
    expect(weightToT(font, 550)).toBeCloseTo(0.5)
    expect(weightToT(font, 100)).toBe(0)
    expect(weightToT(font, 900)).toBe(1)
  })

  it('returns the base font untouched at t = 0 and for static fonts', () => {
    expect(experimental_interpolateFont(font, 0)).toBe(font)
    const staticFont = parseFont(miniFont)
    expect(experimental_interpolateFont(staticFont, 0.5)).toBe(staticFont)
  })

  it('applies full deltas at t = 1', () => {
    const bold = experimental_interpolateFont(font, 1)
    expect(bold.glyphs['H']).toEqual([0, 0, 8, 8, 1, 0, 12])
    expect(bold.kerning['AV']).toBe(-2)
    expect(bold.kerning['Ha']).toBe(-1)
    expect(bold.lineHeight).toBe(16)
    expect(bold.base).toBe(11)
  })

  it('leaves glyphs and pairs without deltas unchanged', () => {
    const bold = experimental_interpolateFont(font, 1)
    expect(bold.glyphs['A']).toBe(font.glyphs['A'])
    expect(bold.glyphs['V']).toBe(font.glyphs['V'])
  })

  it('memoizes derived fonts by quantized t for stable identity', () => {
    const a = experimental_interpolateFont(font, 0.5)
    const b = experimental_interpolateFont(font, 0.5)
    expect(a).toBe(b)
    expect(experimental_interpolateFont(font, 0.5001)).toBe(a)
    expect(experimental_interpolateFont(font, 0.75)).not.toBe(a)
  })

  it('caps the per-font interpolation cache', () => {
    const first = experimental_interpolateFont(font, 1 / 64)
    for (let i = 2; i <= 64; i++) experimental_interpolateFont(font, i / 64)
    // sweeping the range evicts early steps rather than retaining every one
    expect(experimental_interpolateFont(font, 1 / 64)).not.toBe(first)
  })

  it('lays out through the derived font with interpolated advances', () => {
    // H advance at t=1 is 12 instead of 10
    const base = layout(font, 'HH')
    const bold = layout(experimental_interpolateFont(font, 1), 'HH')
    expect(base.glyphs[1].x).toBe(10)
    expect(bold.glyphs[1].x).toBe(13) // 12 advance + 1 xoffset
  })
})
