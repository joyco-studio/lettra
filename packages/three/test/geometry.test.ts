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

  it('builds an empty, drawable geometry for empty layouts', () => {
    const geometry = buildTextGeometry(layout(font, ''))
    expect(geometry.getAttribute('position').count).toBe(0)
    expect(geometry.getIndex()!.count).toBe(0)
  })
})
