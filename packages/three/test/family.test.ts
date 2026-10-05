import { describe, expect, it, vi } from 'vitest'
import { Texture } from 'three/webgpu'
import type { WebGPURenderer } from 'three/webgpu'
import { defineFamily } from '../family'
import type { DefineFamilyOptions } from '../family'
import type { MSDFFont } from '../../core/types'

/* Minimal bakes: regular/bold/italic share size 10, base 9; one glyph each. */
const makeFont = (name: string, overrides: Partial<MSDFFont> = {}): MSDFFont => ({
  name,
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 100, height: 100 },
  glyphs: { H: [0, 0, 8, 8, 0, 1, 10], '?': [50, 0, 6, 8, 0, 1, 8], ' ': [0, 0, 0, 0, 0, 0, 5] },
  kerning: { AV: -4 },
  ...overrides,
})

const SRC: DefineFamilyOptions['src'] = [
  { json: '/f-400.json', atlas: '/f-400.png', weight: 400 },
  { json: '/f-400i.json', atlas: '/f-400i.png', weight: 400, style: 'italic' },
  { json: '/f-700.json', atlas: '/f-700.png', weight: 700 },
]

const fonts: Record<string, MSDFFont> = {
  '/f-400.json': makeFont('regular'),
  '/f-400i.json': makeFont('italic'),
  '/f-700.json': makeFont('bold'),
}

function testFamily(options: Partial<DefineFamilyOptions> = {}) {
  const fontLoads = vi.fn((url: string) => Promise.resolve(fonts[url] ?? makeFont(url)))
  const textureLoads = vi.fn(() => Promise.resolve(new Texture()))
  const family = defineFamily({
    src: SRC,
    loaders: { font: fontLoads, texture: textureLoads },
    ...options,
  })
  return { family, fontLoads, textureLoads }
}

describe('defineFamily', () => {
  it('lists declared variants with idle state and sorted unique weights and styles', () => {
    const { family } = testFamily()
    expect(family.variants.map((v) => [v.weight, v.style, v.state])).toEqual([
      [400, 'normal', 'idle'],
      [400, 'italic', 'idle'],
      [700, 'normal', 'idle'],
    ])
    expect(family.weights).toEqual([400, 700])
    expect(family.styles).toEqual(['normal', 'italic'])
  })

  it('throws on empty src and duplicate variants', () => {
    expect(() => defineFamily({ src: [] })).toThrow(/at least one src/)
    expect(() => defineFamily({ src: [SRC[0], { ...SRC[0] }] })).toThrow(/duplicate variant/)
  })

  it('has matches exact bakes only', () => {
    const { family } = testFamily()
    expect(family.has({ weight: 700 })).toBe(true)
    expect(family.has({ weight: 700, style: 'italic' })).toBe(false)
    expect(family.has({ weight: 500 })).toBe(false)
    expect(family.has()).toBe(true)
  })

  it('load transitions idle → loading → loaded and shares in-flight loads per bake', async () => {
    const { family, fontLoads } = testFamily()
    const pending = family.load({ weight: 700 })
    expect(family.variants[2].state).toBe('loading')
    const [a, b] = await Promise.all([pending, family.load({ weight: 700 })])
    expect(family.variants[2].state).toBe('loaded')
    expect(a.font).toBe(b.font)
    expect(a.map).toBe(b.map)
    expect(fontLoads).toHaveBeenCalledTimes(1)
  })

  it('serves the resolved bake for misses, shearing only when no italic exists', async () => {
    const { family } = testFamily()
    const variant = await family.load({ weight: 500, style: 'italic' })
    expect(variant.weight).toBe(400)
    expect(variant.style).toBe('italic')
    expect(variant.synthetic.slant).toBe(0) // italic bake exists at 400
    // style pool wins over weight distance: 700 italic serves the 400 italic
    const styleFirst = await family.load({ weight: 700, style: 'italic' })
    expect(styleFirst.style).toBe('italic')
    expect(styleFirst.synthetic.slant).toBe(0)
    // no italic bake at all → closest normal + synthetic slant
    const noItalics = defineFamily({
      src: [SRC[0], SRC[2]],
      loaders: { font: (url) => Promise.resolve(fonts[url]), texture: () => Promise.resolve(new Texture()) },
    })
    const faux = await noItalics.load({ weight: 700, style: 'italic' })
    expect(faux.style).toBe('normal')
    expect(faux.synthetic.slant).toBeGreaterThan(0)
  })

  it('throws on misses when synthesis is false', async () => {
    const { family } = testFamily({ synthesis: false })
    await expect(family.load({ weight: 500 })).rejects.toThrow(/synthesis is disabled/)
    await expect(family.load({ weight: 700 })).resolves.toBeDefined()
  })

  it('marks a failed load as error and allows retry after eviction', async () => {
    let shouldFail = true
    const fontLoads = vi.fn((url: string) =>
      shouldFail ? Promise.reject(new Error('boom')) : Promise.resolve(fonts[url])
    )
    const family = defineFamily({
      src: SRC,
      loaders: { font: fontLoads, texture: () => Promise.resolve(new Texture()) },
    })
    await expect(family.load({ weight: 400 })).rejects.toThrow('boom')
    await vi.waitFor(() => expect(family.variants[0].state).toBe('error'))
    expect(family.variants[0].error?.message).toBe('boom')
    shouldFail = false
    const variant = await family.load({ weight: 400 })
    expect(variant.font.name).toBe('regular')
    expect(family.variants[0].state).toBe('loaded')
  })

  it('loadAll honors the filter predicate', async () => {
    const { family, fontLoads } = testFamily()
    const loaded = await family.loadAll((variant) => variant.style === 'normal')
    expect(loaded).toHaveLength(2)
    expect(loaded.every((v) => v.synthetic.slant === 0)).toBe(true)
    expect(fontLoads).toHaveBeenCalledTimes(2)
  })

  it('get returns null before load and the loaded variant after', async () => {
    const { family } = testFamily()
    expect(family.get({ weight: 700 })).toBeNull()
    await family.load({ weight: 700 })
    const variant = family.get({ weight: 600 })
    expect(variant).not.toBeNull()
    expect(variant!.weight).toBe(700) // above 500, heavier bakes come first
    expect(variant!.synthetic.slant).toBe(0)
  })

  it('warmup inits every loaded atlas', async () => {
    const { family } = testFamily()
    await family.loadAll()
    const renderer = { initTexture: vi.fn() } as unknown as WebGPURenderer
    family.warmup(renderer)
    expect((renderer.initTexture as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3)
  })

  it('dispose releases family-owned textures and resets state for reuse', async () => {
    const { family } = testFamily()
    const variant = await family.load({ weight: 400 })
    const dispose = vi.spyOn(variant.map, 'dispose')
    family.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(family.variants[0].state).toBe('idle')
    await expect(family.load({ weight: 400 })).resolves.toBeDefined()
  })

  it('drops a load that lands after dispose instead of resurrecting the family', async () => {
    let release!: (font: MSDFFont) => void
    const map = new Texture()
    const disposed = vi.spyOn(map, 'dispose')
    const family = defineFamily({
      src: [SRC[0]],
      loaders: {
        font: () => new Promise<MSDFFont>((resolve) => (release = resolve)),
        texture: () => Promise.resolve(map),
      },
    })
    const pending = family.load({ weight: 400 })
    family.dispose()
    release(makeFont('regular'))
    // rejects rather than handing back the texture dispose() just killed
    await expect(pending).rejects.toThrow(/disposed while variant/)
    expect(family.variants[0].state).toBe('idle')
    expect(family.get({ weight: 400 })).toBeNull()
    expect(disposed).toHaveBeenCalled()
  })

  it('warns when loaded variants were baked inconsistently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mixed: Record<string, MSDFFont> = {
      '/f-400.json': makeFont('regular'),
      '/f-700.json': makeFont('bold', { size: 20 }),
    }
    const family = defineFamily({
      src: [SRC[0], SRC[2]],
      loaders: { font: (url) => Promise.resolve(mixed[url]), texture: () => Promise.resolve(new Texture()) },
    })
    await family.loadAll()
    expect(warn.mock.calls.flat().join(' ')).toMatch(/baked inconsistently/)
    warn.mockRestore()
  })
})
