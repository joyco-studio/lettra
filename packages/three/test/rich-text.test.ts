import { describe, expect, it } from 'vitest'
import { Texture } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { defineFamily } from '../family'
import { createRichText } from '../rich-text'
import type { MSDFFont } from '../../core/types'

const makeFont = (name: string): MSDFFont => ({
  name,
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 100, height: 100 },
  glyphs: {
    H: [0, 0, 8, 8, 0, 1, 10],
    a: [10, 0, 6, 6, 0, 3, 7],
    '?': [50, 0, 6, 8, 0, 1, 8],
    ' ': [0, 0, 0, 0, 0, 0, 5],
  },
  kerning: {},
})

const fonts: Record<string, MSDFFont> = {
  '/f-400.json': makeFont('regular'),
  '/f-400i.json': makeFont('italic'),
}

async function loadedFamily() {
  const family = defineFamily({
    src: [
      { json: '/f-400.json', atlas: '/f-400.png', weight: 400 },
      { json: '/f-400i.json', atlas: '/f-400i.png', weight: 400, style: 'italic' },
    ],
    loaders: { font: (url) => Promise.resolve(fonts[url]), texture: () => Promise.resolve(new Texture()) },
  })
  await family.loadAll()
  return family
}

describe('createRichText', () => {
  it('buckets spans by variant into one mesh each under a group', async () => {
    const family = await loadedFamily()
    const handle = createRichText({
      family,
      text: 'Ha Ha Ha',
      spans: [
        { start: 3, end: 5, style: 'italic' },
        { start: 6, end: 8, style: 'italic' },
      ],
    })
    // two italic spans share one bucket → 2 meshes total
    expect(handle.group.children).toHaveLength(2)
    const quadCounts = handle.group.children.map((child) => (child as Mesh).geometry.getAttribute('position').count / 4)
    expect(quadCounts.sort()).toEqual([2, 4])
    expect(handle.layout.metrics.fontSize).toBe(10)
    handle.dispose()
  })

  it('throws when a span variant is not loaded', async () => {
    const family = await loadedFamily()
    expect(() =>
      createRichText({
        family,
        text: 'Ha',
        spans: [{ start: 0, end: 1, weight: 700 }],
      })
    ).not.toThrow() // 700 resolves to the loaded 400 bake
    const empty = defineFamily({
      src: [{ json: '/f-400.json', atlas: '/f-400.png', weight: 400 }],
      loaders: { font: (url) => Promise.resolve(fonts[url]), texture: () => Promise.resolve(new Texture()) },
    })
    expect(() => createRichText({ family: empty, text: 'Ha' })).toThrow(/not loaded/)
  })

  it('ranks glyphIndex in text order, not bucket order', async () => {
    const family = await loadedFamily()
    // italic span in the middle: the regular bucket holds chars 0,1 and 4,5
    const handle = createRichText({ family, text: 'HaHaHa', spans: [{ start: 2, end: 4, style: 'italic' }] })
    const byBucket = handle.group.children.map((child) => [
      ...new Set(Array.from((child as Mesh).geometry.getAttribute('glyphIndex').array)),
    ])
    // the middle span must own the middle ordinals, or staggers run out of order
    expect(byBucket).toEqual([
      [0, 1, 4, 5],
      [2, 3],
    ])
    handle.dispose()
  })

  it('gives a whitespace-only span no mesh', async () => {
    const family = await loadedFamily()
    const handle = createRichText({ family, text: 'Ha Ha', spans: [{ start: 2, end: 3, style: 'italic' }] })
    expect(handle.group.children).toHaveLength(1)
    handle.dispose()
  })

  it('exposes a flattened glyphs array so the layout reads like a single-font one', async () => {
    const family = await loadedFamily()
    const handle = createRichText({
      family,
      text: 'Ha Ha',
      spans: [{ start: 3, end: 5, style: 'italic' }],
    })
    expect(handle.layout.glyphs.map((g) => g.index)).toEqual([0, 1, 3, 4])
    handle.dispose()
  })

  it('rejects overlapping spans', async () => {
    const family = await loadedFamily()
    expect(() =>
      createRichText({
        family,
        text: 'HaHa',
        spans: [
          { start: 0, end: 3, style: 'italic' },
          { start: 2, end: 4 },
        ],
      })
    ).toThrow(/overlap/)
  })

  it('keeps a synthetic italic span out of the upright bucket', async () => {
    // upright-only family: the italic span resolves to the same font and atlas,
    // so only the slant separates the two buckets
    const uprightOnly = defineFamily({
      src: [{ json: '/f-400.json', atlas: '/f-400.png', weight: 400 }],
      loaders: { font: (url) => Promise.resolve(fonts[url]), texture: () => Promise.resolve(new Texture()) },
    })
    await uprightOnly.loadAll()
    const handle = createRichText({
      family: uprightOnly,
      text: 'HaHa',
      spans: [{ start: 2, end: 4, style: 'italic' }],
      geometry: { anchor: 'baseline-left' },
    })
    expect(handle.group.children).toHaveLength(2)
    const leanOf = (mesh: Mesh) => {
      const position = mesh.geometry.getAttribute('position')
      // top-left x minus bottom-left x: zero upright, positive when sheared
      return position.getX(0) - position.getX(3)
    }
    const leans = handle.group.children.map((child) => leanOf(child as Mesh)).sort((a, b) => a - b)
    expect(leans[0]).toBeCloseTo(0)
    expect(leans[1]).toBeGreaterThan(0)
    handle.dispose()
  })

  it('builds an empty paragraph and clears via setText', async () => {
    const family = await loadedFamily()
    const handle = createRichText({ family, text: '' })
    expect(handle.group.children).toHaveLength(0)
    handle.setText('Ha')
    expect(handle.group.children).toHaveLength(1)
    handle.setText('')
    expect(handle.group.children).toHaveLength(0)
    handle.dispose()
  })

  it('clips carried-over spans to a shorter text, and keeps explicit ones strict', async () => {
    const family = await loadedFamily()
    const handle = createRichText({ family, text: 'Ha Ha', spans: [{ start: 3, end: 5, style: 'italic' }] })
    // the caller changed the string, not the styling: the span rides along, cut
    handle.setText('Ha H')
    expect(handle.layout.runs.map((run) => run.glyphs.length)).toEqual([2, 1])
    handle.setText('')
    expect(handle.group.children).toHaveLength(0)
    // spans dropped entirely once the text no longer reaches them
    handle.setText('Ha')
    expect(handle.group.children).toHaveLength(1)
    // but a span passed by hand must fit
    expect(() => handle.setText('Ha', [{ start: 0, end: 9, style: 'italic' }])).toThrow(/exceeds the text length/)
    handle.dispose()
  })

  it('rebuilds on setText and notifies listeners', async () => {
    const family = await loadedFamily()
    const handle = createRichText({ family, text: 'Ha' })
    let fired = 0
    handle.onChange(() => fired++)
    handle.setText('Ha Ha', [{ start: 3, end: 5, style: 'italic' }])
    expect(fired).toBe(1)
    expect(handle.group.children).toHaveLength(2)
    handle.dispose()
  })
})
