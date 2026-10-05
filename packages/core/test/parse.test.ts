import { describe, expect, it, vi } from 'vitest'
import { fromBMFont, getFontLookup, isBMFont, loadFont, parseFont } from '../parse'
import miniFont from './fixtures/mini-font.json'
import miniVariableFont from './fixtures/mini-variable-font.json'
import bmfontSample from './fixtures/bmfont-sample.json'

describe('fromBMFont', () => {
  it('converts chars to a char-keyed record and drops generator noise', () => {
    const font = fromBMFont(bmfontSample as any)
    expect(font.name).toBe('SampleFace')
    expect(font.size).toBe(42)
    expect(font.lineHeight).toBe(53)
    expect(font.base).toBe(42)
    expect(font.distanceRange).toBe(8)
    expect(font.atlas).toEqual({ width: 128, height: 64 })
    expect(Object.keys(font.glyphs).sort()).toEqual([' ', '?', 'A', 'V', 'a'])
    // [x, y, w, h, xoffset, yoffset, xadvance] — metrics round-trip exactly
    expect(font.glyphs['A']).toEqual([0, 0, 30, 32, -1, 10, 28])
    expect(JSON.stringify(font)).not.toMatch(/chnl|page|index/)
  })

  it('keys kerning by character pair and drops zero-amount pairs', () => {
    const font = fromBMFont(bmfontSample as any)
    expect(font.kerning).toEqual({ AV: -3, Va: -2 })
  })

  it('rejects multi-page atlases with a descriptive error', () => {
    const multi = { ...bmfontSample, common: { ...bmfontSample.common, pages: 2 } }
    expect(() => fromBMFont(multi as any)).toThrow(/multi-page/)
  })

  it('rejects non-BMFont input', () => {
    expect(() => fromBMFont({} as any)).toThrow(/BMFont/)
  })
})

describe('parseFont', () => {
  it('accepts the minified MSDFFont schema', () => {
    const font = parseFont(miniFont)
    expect(font.size).toBe(10)
    expect(font.glyphs['H']).toEqual([0, 0, 8, 8, 0, 1, 10])
  })

  it('auto-detects and converts raw BMFont JSON', () => {
    const font = parseFont(bmfontSample)
    expect(font.name).toBe('SampleFace')
    expect(font.glyphs['V']).toEqual([32, 0, 30, 32, -1, 10, 28])
  })

  it('throws descriptive errors for malformed fonts', () => {
    expect(() => parseFont(null)).toThrow(/must be an object/)
    expect(() => parseFont({ size: 10 })).toThrow(/lineHeight/)
    expect(() => parseFont({ ...miniFont, atlas: {} })).toThrow(/atlas/)
    expect(() => parseFont({ ...miniFont, glyphs: { H: [1, 2] } })).toThrow(/tuple of 7/)
  })

  it('warns when a font bakes with zero kerning pairs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    parseFont({ ...miniFont, kerning: {} })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/kerning/)
    expect(warn.mock.calls[0][0]).toMatch(/instancer/)
    warn.mockRestore()
  })

  it('warns when the charset is missing runtime fallback glyphs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const glyphs = { ...parseFont(miniFont).glyphs }
    delete glyphs[' ']
    delete glyphs['?']
    parseFont({ ...miniFont, glyphs })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/space/)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/\?/)
    warn.mockRestore()
  })
})

describe('parseFont delta-channel fields', () => {
  it('round-trips the optional variable-bake fields', () => {
    const font = parseFont(miniVariableFont)
    expect(font.weightRange).toEqual([300, 800])
    expect(font.deltaChannel).toBe(true)
    expect(font.deltaScale).toBe(2)
    expect(font.glyphDeltas?.['H']).toEqual([1, -1, 2])
    expect(font.kerningDeltas?.['AV']).toBe(2)
    expect(font.metricsDelta).toEqual([4, 2])
  })

  it('leaves legacy fonts without delta fields', () => {
    const font = parseFont(miniFont)
    expect('weightRange' in font).toBe(false)
    expect('glyphDeltas' in font).toBe(false)
  })

  it('throws descriptive errors for malformed delta fields', () => {
    expect(() => parseFont({ ...miniVariableFont, weightRange: [800, 300] })).toThrow(/min < max/)
    expect(() => parseFont({ ...miniVariableFont, weightRange: [400] })).toThrow(/weightRange/)
    expect(() => parseFont({ ...miniVariableFont, glyphDeltas: { H: [1, 2] } })).toThrow(/tuple of 3/)
    expect(() => parseFont({ ...miniVariableFont, glyphDeltas: { Z: [1, 2, 3] } })).toThrow(/no matching glyph/)
    expect(() => parseFont({ ...miniVariableFont, kerningDeltas: { AV: 'x' } })).toThrow(/kerningDeltas/)
    expect(() => parseFont({ ...miniVariableFont, metricsDelta: [1] })).toThrow(/metricsDelta/)
  })
})

describe('parseFont memoization', () => {
  it('passes an already-parsed font through untouched', () => {
    const font = parseFont(miniFont)
    expect(parseFont(font)).toBe(font)
  })

  it('returns the same MSDFFont object for the same JSON object', () => {
    expect(parseFont(miniFont)).toBe(parseFont(miniFont))
    expect(parseFont(bmfontSample)).toBe(parseFont(bmfontSample))
  })

  it('parses and warns once per JSON object, not per call', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const json = { ...miniFont, kerning: {} }
    const first = parseFont(json)
    expect(parseFont(json)).toBe(first)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('loadFont', () => {
  const fontResponse = () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(structuredClone(miniFont)),
  })

  it('shares one request and one font object per URL', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(fontResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([loadFont('/fonts/a.json'), loadFont('/fonts/a.json')])
    expect(a).toBe(b)
    expect(await loadFont('/fonts/a.json')).toBe(a)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('throws on HTTP errors and evicts the failure so retries refetch', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }))
      .mockImplementationOnce(() => Promise.resolve(fontResponse()))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadFont('/fonts/missing.json')).rejects.toThrow(/404/)
    const font = await loadFont('/fonts/missing.json')
    expect(font.size).toBe(10)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})

describe('getFontLookup', () => {
  it('builds O(1) maps and caches them per font object', () => {
    const font = parseFont(miniFont)
    const lookup = getFontLookup(font)
    expect(lookup.glyphs.get('H')).toMatchObject({ width: 8, xadvance: 10 })
    expect(lookup.kerning.get('AV')).toBe(-4)
    expect(getFontLookup(font)).toBe(lookup)
  })
})

describe('isBMFont', () => {
  it('distinguishes the two schemas', () => {
    expect(isBMFont(bmfontSample)).toBe(true)
    expect(isBMFont(miniFont)).toBe(false)
  })
})
