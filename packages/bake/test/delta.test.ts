import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { buildDeltaFont, checkFit, compositeDelta, decodeDeltaByte, encodeDeltaByte, mapFrame, median } from '../delta'
import { readTableTags, isVariableFont, hasKerningTables } from '../sfnt'
import type { GlyphTuple, MSDFFont } from '../../core/types'

describe('delta math', () => {
  it('encodes and decodes deltas symmetrically around byte 128', () => {
    expect(encodeDeltaByte(0, 0.5)).toBe(128)
    expect(encodeDeltaByte(0, 0)).toBe(128)
    expect(decodeDeltaByte(encodeDeltaByte(0.25, 0.5), 0.5)).toBeCloseTo(0.25, 2)
    expect(decodeDeltaByte(encodeDeltaByte(-0.5, 0.5), 0.5)).toBeCloseTo(-0.5, 2)
    expect(encodeDeltaByte(0.5, 0.5)).toBe(255)
    expect(encodeDeltaByte(-0.5, 0.5)).toBe(0)
  })

  it('recovers the median of three channels', () => {
    expect(median(0.2, 0.5, 0.8)).toBe(0.5)
    expect(median(0.9, 0.1, 0.5)).toBe(0.5)
    expect(median(1, 1, 0)).toBe(1)
  })

  it('maps max-rect texels into the min frame by offset difference', () => {
    const maxGlyph: GlyphTuple = [0, 0, 12, 12, -2, 1, 11]
    const minGlyph: GlyphTuple = [40, 8, 8, 8, 0, 3, 10]
    expect(mapFrame(maxGlyph, minGlyph)).toEqual({ dx: -2, dy: -2 })
  })

  it('rejects min ink that escapes the max rect', () => {
    const wide: GlyphTuple = [0, 0, 6, 6, 2, 2, 10] // max rect too small/shifted
    const min: GlyphTuple = [0, 0, 8, 8, 0, 0, 10]
    expect(checkFit('H', wide, min)).toMatch(/does not fit/)
    const containing: GlyphTuple = [0, 0, 10, 10, -1, -1, 12]
    expect(checkFit('H', containing, min)).toBeNull()
  })
})

const makeFont = (overrides: Partial<MSDFFont>): MSDFFont => ({
  name: 'vf-test',
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 16, height: 16 },
  glyphs: {},
  kerning: {},
  ...overrides,
})

describe('compositeDelta', () => {
  it('re-grids the min field and encodes the median delta in alpha', () => {
    // one 2×2 glyph; min at (0,0), max at (4,4); same offsets → dx=dy=0
    const minFont = makeFont({ glyphs: { H: [0, 0, 2, 2, 0, 0, 10] }, kerning: { AV: -4 } })
    const maxFont = makeFont({ glyphs: { H: [4, 4, 2, 2, 0, 0, 12] }, kerning: { AV: -2 } })
    const minPng = new PNG({ width: 16, height: 16 })
    const maxPng = new PNG({ width: 16, height: 16 })
    // min field: medians 0.2; max field at its rect: medians 0.6
    for (const [png, origin, value] of [
      [minPng, 0, 51],
      [maxPng, 4, 153],
    ] as const) {
      for (let v = 0; v < 2; v++) {
        for (let u = 0; u < 2; u++) {
          const idx = ((origin + v) * 16 + origin + u) * 4
          png.data[idx] = png.data[idx + 1] = png.data[idx + 2] = value
        }
      }
    }
    const result = compositeDelta({
      min: { font: minFont, png: minPng },
      max: { font: maxFont, png: maxPng },
      weightRange: [300, 800],
    })
    // RGB inside the max rect is now the min field
    const idx = (4 * 16 + 4) * 4
    expect(result.png.data[idx]).toBe(51)
    // delta = 0.6 − 0.2 = 0.4 → deltaScale 0.4 → alpha 255
    expect(result.deltaScale).toBeCloseTo(0.4, 2)
    expect(result.png.data[idx + 3]).toBe(255)
    // texels outside glyph rects carry zero delta
    expect(result.png.data[3]).toBe(128)
    // JSON: max grid + min advance base + deltas
    expect(result.font.glyphs['H']).toEqual([4, 4, 2, 2, 0, 0, 10])
    expect(result.font.glyphDeltas?.['H']).toEqual([0, 0, 2])
    expect(result.font.kerning).toEqual({ AV: -4 })
    expect(result.font.kerningDeltas).toEqual({ AV: 2 })
    expect(result.font.weightRange).toEqual([300, 800])
    expect(result.font.deltaChannel).toBe(true)
  })

  it('rejects mismatched charsets and sizes', () => {
    const a = makeFont({ glyphs: { H: [0, 0, 2, 2, 0, 0, 10] } })
    const b = makeFont({ glyphs: { X: [0, 0, 2, 2, 0, 0, 10] } })
    const png = () => new PNG({ width: 16, height: 16 })
    expect(() =>
      compositeDelta({ min: { font: a, png: png() }, max: { font: b, png: png() }, weightRange: [300, 800] })
    ).toThrow(/charset/)
    const c = makeFont({ size: 20, glyphs: { H: [0, 0, 2, 2, 0, 0, 10] } })
    expect(() =>
      compositeDelta({ min: { font: a, png: png() }, max: { font: c, png: png() }, weightRange: [300, 800] })
    ).toThrow(/font size/)
  })

  it('omits empty delta maps from the JSON', () => {
    const same = { glyphs: { H: [0, 0, 2, 2, 0, 0, 10] as GlyphTuple }, kerning: {} }
    const font = buildDeltaFont(makeFont(same), makeFont(same), [300, 800], 0.1)
    expect('glyphDeltas' in font).toBe(false)
    expect('kerningDeltas' in font).toBe(false)
    expect('metricsDelta' in font).toBe(false)
  })
})

describe('sfnt preflight', () => {
  const sfnt = (tags: string[]): Uint8Array => {
    const data = new Uint8Array(12 + tags.length * 16)
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, tags.length)
    tags.forEach((tag, i) => {
      for (let c = 0; c < 4; c++) data[12 + i * 16 + c] = tag.charCodeAt(c)
    })
    return data
  }

  it('reads table tags and classifies fonts', () => {
    const tags = readTableTags(sfnt(['glyf', 'fvar', 'GPOS']))
    expect(tags).toEqual(['glyf', 'fvar', 'GPOS'])
    expect(isVariableFont(tags)).toBe(true)
    expect(hasKerningTables(tags)).toBe(true)
    expect(hasKerningTables(['glyf', 'kern'])).toBe(true)
    expect(isVariableFont(['glyf'])).toBe(false)
  })

  it('rejects collections and non-fonts', () => {
    const ttc = new Uint8Array(12)
    new DataView(ttc.buffer).setUint32(0, 0x74746366)
    expect(() => readTableTags(ttc)).toThrow(/collections/)
    expect(() => readTableTags(new Uint8Array([1, 2, 3]))).toThrow(/too short/)
    const junk = new Uint8Array(12)
    new DataView(junk.buffer).setUint32(0, 0xdeadbeef)
    expect(() => readTableTags(junk)).toThrow(/sfnt magic/)
  })
})
