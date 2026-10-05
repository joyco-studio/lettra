import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SYNTHESIS, resolveVariant, syntheticThresholdShift } from '../family'
import type { VariantDescriptor } from '../family'

const SOURCES: VariantDescriptor[] = [{ weight: 400 }, { weight: 400, style: 'italic' }, { weight: 700 }]

describe('resolveVariant', () => {
  it('resolves an exact weight and style with zero corrections', () => {
    const resolved = resolveVariant(SOURCES, { weight: 700 })
    expect(resolved.source).toBe(SOURCES[2])
    expect(resolved.exact).toBe(true)
    expect(resolved.synthetic).toEqual({ boldness: 0, slant: 0 })
  })

  it('defaults the request to weight 400 normal', () => {
    const resolved = resolveVariant(SOURCES)
    expect(resolved.source).toBe(SOURCES[0])
    expect(resolved.exact).toBe(true)
  })

  it('boldens up from the nearest lighter bake', () => {
    const lighter = resolveVariant(SOURCES, { weight: 500 })
    expect(lighter.source.weight).toBe(400)
    expect(lighter.synthetic.boldness).toBeCloseTo(0.007)
    expect(lighter.exact).toBe(false)
    // ties go to the lighter bake: bolden beats serving heavier as-is
    const tie = resolveVariant([{ weight: 300 }, { weight: 500 }], { weight: 400 })
    expect(tie.source.weight).toBe(300)
    expect(tie.synthetic.boldness).toBeCloseTo(0.007)
  })

  it('never thins: nearer-heavier bakes serve as-is, lighter requests serve the lightest', () => {
    const heavier = resolveVariant(SOURCES, { weight: 600 })
    expect(heavier.source.weight).toBe(700)
    expect(heavier.synthetic.boldness).toBe(0)
    expect(heavier.exact).toBe(false)
    const thin = resolveVariant(SOURCES, { weight: 100 })
    expect(thin.source.weight).toBe(400)
    expect(thin.synthetic.boldness).toBe(0)
  })

  it('synthesizes italic from the nearest normal bake with the default slant', () => {
    const resolved = resolveVariant([{ weight: 400 }, { weight: 700 }], { weight: 700, style: 'italic' })
    expect(resolved.source.weight).toBe(700)
    expect(resolved.synthetic.slant).toBeCloseTo(DEFAULT_SYNTHESIS.slant)
    expect(resolved.exact).toBe(false)
  })

  it('serves a normal request from an italic-only family without un-slanting', () => {
    const resolved = resolveVariant([{ weight: 400, style: 'italic' }], { weight: 400 })
    expect(resolved.synthetic.slant).toBe(0)
    expect(resolved.exact).toBe(false)
  })

  it('honors custom synthesis strengths', () => {
    const resolved = resolveVariant(
      [{ weight: 400 }],
      { weight: 600, style: 'italic' },
      {
        boldnessPerHundredWeight: 0.01,
        slant: 0.3,
      }
    )
    expect(resolved.synthetic.boldness).toBeCloseTo(0.02)
    expect(resolved.synthetic.slant).toBe(0.3)
  })

  it('throws on a resolution miss when synthesis is false', () => {
    expect(() => resolveVariant(SOURCES, { weight: 500 }, false)).toThrow(/synthesis is disabled/)
    expect(resolveVariant(SOURCES, { weight: 400, style: 'italic' }, false).exact).toBe(true)
  })

  it('throws on an empty source list', () => {
    expect(() => resolveVariant([], {})).toThrow(/at least one source/)
  })
})

describe('syntheticThresholdShift', () => {
  it('converts boldness em to a threshold shift using size and distanceRange', () => {
    expect(syntheticThresholdShift(0.021, { size: 64, distanceRange: 4 })).toBeCloseTo(0.336)
    expect(syntheticThresholdShift(-0.01, { size: 64, distanceRange: 8 })).toBeCloseTo(-0.08)
    expect(syntheticThresholdShift(0, { size: 64, distanceRange: 8 })).toBe(0)
  })

  it('clamps extreme shifts and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(syntheticThresholdShift(0.1, { size: 64, distanceRange: 4 })).toBe(0.4)
      expect(syntheticThresholdShift(-0.1, { size: 64, distanceRange: 4 })).toBe(-0.4)
      expect(warn.mock.calls.length).toBeLessThanOrEqual(1)
    } finally {
      warn.mockRestore()
    }
  })
})
