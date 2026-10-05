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

  it('keeps glyphIndex paragraph-global across buckets', async () => {
    const family = await loadedFamily()
    const handle = createRichText({
      family,
      text: 'Ha Ha',
      spans: [{ start: 3, end: 5, style: 'italic' }],
    })
    const indices = handle.group.children.flatMap((child) =>
      Array.from((child as Mesh).geometry.getAttribute('glyphIndex').array)
    )
    // 4 visible glyphs over 2 buckets: ordinals must not restart per bucket
    expect([...new Set(indices)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
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
