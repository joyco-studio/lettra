import { describe, expect, it } from 'vitest'
import { layout, parseFont } from '../../core'
import { buildTextGeometry } from '../geometry'
import miniFont from '../../core/test/fixtures/mini-font.json'

const font = parseFont(miniFont)

const attr = (geometry: ReturnType<typeof buildTextGeometry>, name: string) =>
  Array.from((geometry.getAttribute(name) as { array: ArrayLike<number> }).array)

describe('buildTextGeometry', () => {
  it('emits 4 vertices and 6 indices per visible glyph', () => {
    const geometry = buildTextGeometry(layout(font, 'Ha'))
    expect(geometry.getAttribute('position').count).toBe(8)
    expect(geometry.getIndex()!.count).toBe(12)
  })

  it('writes y-down atlas UV ratios per corner', () => {
    // 'H' atlas rect = (0, 0, 8, 8) in a 100px atlas → u/v span [0, 0.08]
    const geometry = buildTextGeometry(layout(font, 'H'))
    const expected = [0, 0, 0.08, 0, 0.08, 0.08, 0, 0.08]
    attr(geometry, 'uv').forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5))
  })

  it('writes a 0→1 cellUv per quad corner, matching uv orientation', () => {
    const geometry = buildTextGeometry(layout(font, 'Ha'))
    expect(attr(geometry, 'cellUv')).toEqual([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1])
  })

  it('scales to em units by default and centers the ink box', () => {
    // 'H' ink = 8×8 px at fontSize 10 → 0.8 world units centered on origin
    const geometry = buildTextGeometry(layout(font, 'H'))
    const positions = attr(geometry, 'position')
    const xs = positions.filter((_, i) => i % 3 === 0)
    const ys = positions.filter((_, i) => i % 3 === 1)
    expect(Math.min(...xs)).toBeCloseTo(-0.4)
    expect(Math.max(...xs)).toBeCloseTo(0.4)
    expect(Math.min(...ys)).toBeCloseTo(-0.4)
    expect(Math.max(...ys)).toBeCloseTo(0.4)
  })

  it('anchors baseline-left at the first baseline pen origin', () => {
    // base = 9, H yoffset = 1 → quad top at (9 - 1)/10 = 0.8, left at 0
    const geometry = buildTextGeometry(layout(font, 'H'), { anchor: 'baseline-left' })
    const positions = attr(geometry, 'position')
    expect(positions[0]).toBeCloseTo(0) // TL.x
    expect(positions[1]).toBeCloseTo(0.8) // TL.y
  })

  it('spans layoutX from 0 to 1 across the ink width', () => {
    const geometry = buildTextGeometry(layout(font, 'HaH'))
    const layoutX = attr(geometry, 'layoutX')
    expect(Math.min(...layoutX)).toBe(0)
    expect(Math.max(...layoutX)).toBe(1)
    // per-vertex, not per-glyph: each quad's left/right corners differ
    expect(layoutX[0]).not.toBe(layoutX[1])
  })

  it('holds glyphIndex and lineIndex constant across a quad', () => {
    const geometry = buildTextGeometry(layout(font, 'H\nH'))
    expect(attr(geometry, 'glyphIndex')).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
    expect(attr(geometry, 'lineIndex')).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
  })

  it('applies no shear at slant 0', () => {
    const plain = buildTextGeometry(layout(font, 'Ha'))
    const zero = buildTextGeometry(layout(font, 'Ha'), { slant: 0 })
    expect(attr(zero, 'position')).toEqual(attr(plain, 'position'))
  })

  it('shears corners about each line baseline, proportional to baseline distance', () => {
    // 'H': rect top at y = 1, bottom at y = 9 = baseline → bottom corners fixed
    const result = layout(font, 'H')
    const plain = buildTextGeometry(result, { anchor: 'baseline-left' })
    const slanted = buildTextGeometry(result, { anchor: 'baseline-left', slant: 0.25 })
    const p = attr(plain, 'position')
    const s = attr(slanted, 'position')
    // TL.x shifts by slant × (9 − 1) × scale = 0.25 × 8 / 10 = 0.2
    expect(s[0] - p[0]).toBeCloseTo(0.2)
    expect(s[3] - p[3]).toBeCloseTo(0.2) // TR
    expect(s[6] - p[6]).toBeCloseTo(0) // BR sits on the baseline
    expect(s[9] - p[9]).toBeCloseTo(0) // BL
    // second line shears about its own baseline: same per-corner deltas
    const twoLines = layout(font, 'H\nH')
    const s2 = attr(buildTextGeometry(twoLines, { anchor: 'baseline-left', slant: 0.25 }), 'position')
    const p2 = attr(buildTextGeometry(twoLines, { anchor: 'baseline-left' }), 'position')
    expect(s2[12] - p2[12]).toBeCloseTo(0.2) // line 1 TL.x
    expect(s2[18] - p2[18]).toBeCloseTo(0) // line 1 BR.x
  })

  it('anchors and normalizes layoutX against overridden bounds', () => {
    // one combined layout vs the same quads built against shared bounds
    const combined = layout(font, 'HH')
    const reference = buildTextGeometry(combined)
    const bounds = {
      inkOrigin: combined.inkOrigin,
      width: combined.width,
      height: combined.height,
      baseline: combined.metrics.baseline,
    }
    const rebuilt = buildTextGeometry(combined, { bounds })
    expect(attr(rebuilt, 'position')).toEqual(attr(reference, 'position'))
    expect(attr(rebuilt, 'layoutX')).toEqual(attr(reference, 'layoutX'))
    // halved width doubles nothing at 0 but rescales the right edge
    const stretched = buildTextGeometry(combined, { bounds: { ...bounds, width: bounds.width * 2 } })
    expect(Math.max(...attr(stretched, 'layoutX'))).toBeCloseTo(0.5)
  })

  it('offsets glyphIndex for per-run geometries', () => {
    const geometry = buildTextGeometry(layout(font, 'Ha'), { glyphIndexOffset: 3 })
    expect(attr(geometry, 'glyphIndex')).toEqual([3, 3, 3, 3, 4, 4, 4, 4])
  })

  it('builds an empty, drawable geometry for empty layouts', () => {
    const geometry = buildTextGeometry(layout(font, ''))
    expect(geometry.getAttribute('position').count).toBe(0)
    expect(geometry.getIndex()!.count).toBe(0)
  })
})
