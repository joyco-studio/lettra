import { describe, expect, it } from 'vitest'
import { Texture } from 'three/webgpu'
import { createText } from '../text'
import type { LoadedVariant } from '../family'
import type { MSDFFont } from '../../core/types'

const font = (name: string): MSDFFont => ({
  name,
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 100, height: 100 },
  glyphs: { H: [0, 0, 8, 8, 0, 1, 10], '?': [50, 0, 6, 8, 0, 1, 8], ' ': [0, 0, 0, 0, 0, 0, 5] },
  kerning: { AV: -4 },
})

const variant = (name: string, synthetic = { boldness: 0, slant: 0 }): LoadedVariant => ({
  font: font(name),
  map: new Texture(),
  weight: 400,
  style: 'normal',
  synthetic,
})

describe('createText variants', () => {
  it('keeps uniform identity across a variant swap so tweens survive', () => {
    const text = createText({ variant: variant('regular'), text: 'H', material: { fill: '#ff0000' } })
    const fill = text.uniforms.fill
    text.uniforms.opacity.value = 0.5
    text.setVariant(variant('bold'))
    expect(text.uniforms.fill).toBe(fill)
    expect(text.uniforms.opacity.value).toBe(0.5)
    text.dispose()
  })

  it('applies the synthetic boldness correction to the shared uniform', () => {
    const text = createText({ variant: variant('regular'), text: 'H' })
    expect(text.uniforms.boldness.value).toBe(0)
    text.setVariant(variant('bold', { boldness: 0.01, slant: 0 }))
    // em → threshold units: 0.01 * size 10 / distanceRange 8
    expect(text.uniforms.boldness.value).toBeCloseTo(0.0125)
    text.dispose()
  })

  it('leaves a family-owned atlas alone on dispose', () => {
    const v = variant('regular')
    const text = createText({ variant: v, text: 'H' })
    let disposed = false
    v.map.addEventListener('dispose', () => (disposed = true))
    text.dispose()
    expect(disposed).toBe(false)
  })
})
