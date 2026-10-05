import { describe, expect, it } from 'vitest'
import { DEFAULT_SYNTHESIS, resolveVariant } from '../family'
import type { VariantDescriptor } from '../family'

const SOURCES: VariantDescriptor[] = [{ weight: 400 }, { weight: 400, style: 'italic' }, { weight: 700 }]

describe('resolveVariant', () => {
  it('resolves an exact weight and style with zero corrections', () => {
    const resolved = resolveVariant(SOURCES, { weight: 700 })
    expect(resolved.source).toBe(SOURCES[2])
    expect(resolved.exact).toBe(true)
    expect(resolved.synthetic).toEqual({ slant: 0 })
  })

  it('defaults the request to weight 400 normal', () => {
    const resolved = resolveVariant(SOURCES)
    expect(resolved.source).toBe(SOURCES[0])
    expect(resolved.exact).toBe(true)
  })

  it('searches heavier first above 500, lighter first below 400 (CSS order)', () => {
    for (const weight of [510, 550, 600, 690]) {
      const resolved = resolveVariant(SOURCES, { weight })
      expect(resolved.source.weight).toBe(700)
      expect(resolved.exact).toBe(false)
    }
    // inside 400..500 the climb stops at 500, so 700 is not a candidate yet
    for (const weight of [450, 500]) {
      expect(resolveVariant(SOURCES, { weight }).source.weight).toBe(400)
    }
    const tie = resolveVariant([{ weight: 300 }, { weight: 500 }], { weight: 400 })
    expect(tie.source.weight).toBe(500)
    // below 400, lighter bakes win even when a heavier one is nearer
    expect(resolveVariant([{ weight: 100 }, { weight: 700 }], { weight: 300 }).source.weight).toBe(100)
    expect(resolveVariant(SOURCES, { weight: 100 }).source.weight).toBe(400)
  })

  it('never alters weight: every resolution serves its bake unmodified', () => {
    for (const weight of [100, 450, 500, 550, 900]) {
      expect(resolveVariant(SOURCES, { weight }).synthetic).toEqual({ slant: 0 })
    }
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

  it('honors a custom slant', () => {
    const resolved = resolveVariant([{ weight: 400 }], { weight: 600, style: 'italic' }, { slant: 0.3 })
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
