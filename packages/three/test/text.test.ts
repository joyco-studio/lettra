import { describe, expect, it } from 'vitest'
import { Texture } from 'three/webgpu'
import { createText } from '../text'
import type { LoadedVariant } from '../family'
import type { MSDFFont } from '../../core/types'

const base: MSDFFont = {
  name: 'static',
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 100, height: 100 },
  glyphs: { H: [0, 0, 8, 8, 0, 1, 10], '?': [50, 0, 6, 8, 0, 1, 8], ' ': [0, 0, 0, 0, 0, 0, 5] },
  kerning: {},
}

const deltaFont: MSDFFont = {
  ...base,
  name: 'vf',
  weightRange: [300, 800],
  deltaChannel: true,
  deltaScale: 0.6,
}

const variant = (font: MSDFFont, weightT?: number): LoadedVariant => ({
  font,
  map: new Texture(),
  weight: 400,
  style: 'normal',
  synthetic: { boldness: 0, slant: 0 },
  ...(weightT !== undefined ? { weightT } : {}),
})

describe('createText variant switching', () => {
  it('gains the weight uniform when switching from a static to a delta variant', () => {
    const text = createText({ variant: variant(base), text: 'H' })
    expect(text.uniforms.weightT).toBeUndefined()

    const material = text.mesh.material
    text.setVariant(variant(deltaFont, 0.5))
    expect(text.uniforms.weightT?.value).toBe(0.5)
    expect(text.mesh.material).not.toBe(material)

    text.experimental_setWeightT(0.25)
    expect(text.uniforms.weightT?.value).toBe(0.25)
    text.dispose()
  })

  it('drops the weight uniform when switching back to a static variant', () => {
    const text = createText({ variant: variant(deltaFont, 1), text: 'H' })
    expect(text.uniforms.weightT?.value).toBe(1)
    text.setVariant(variant(base))
    expect(text.uniforms.weightT).toBeUndefined()
    text.dispose()
  })

  it('keeps uniform identity across a rebuild so tweens survive', () => {
    const text = createText({ variant: variant(base), text: 'H', material: { fill: '#ff0000' } })
    const fill = text.uniforms.fill
    text.uniforms.opacity.value = 0.5
    text.setVariant(variant(deltaFont, 0.5))
    expect(text.uniforms.fill).toBe(fill)
    expect(text.uniforms.opacity.value).toBe(0.5)
    text.dispose()
  })
})
