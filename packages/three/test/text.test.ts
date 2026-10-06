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

const variant = (name: string, synthetic = { slant: 0 }): LoadedVariant => ({
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

  it('shears the geometry for a synthetic oblique variant', () => {
    const text = createText({ variant: variant('regular'), text: 'H', geometry: { anchor: 'baseline-left' } })
    const upright = Array.from(text.mesh.geometry.getAttribute('position').array as Float32Array)
    text.setVariant(variant('oblique', { slant: 0.25 }))
    const sheared = Array.from(text.mesh.geometry.getAttribute('position').array as Float32Array)
    // the top of the quad leans right of where it sat upright
    expect(sheared[0]).toBeGreaterThan(upright[0])
    text.dispose()
  })

  it('drops a synthetic slant when a raw font swaps in', () => {
    const text = createText({ variant: variant('regular'), text: 'H', geometry: { anchor: 'baseline-left' } })
    const upright = Array.from(text.mesh.geometry.getAttribute('position').array as Float32Array)
    text.setVariant(variant('oblique', { slant: 0.25 }))
    text.swapFont({ font: font('raw'), map: new Texture() })
    const swapped = Array.from(text.mesh.geometry.getAttribute('position').array as Float32Array)
    expect(swapped[0]).toBeCloseTo(upright[0])
    text.dispose()
  })

  it('honors an explicitly requested slant throughout, variant source or not', () => {
    const plain = createText({ variant: variant('regular'), text: 'H', geometry: { anchor: 'baseline-left' } })
    const noSlant = plain.mesh.geometry.getAttribute('position').getX(0)
    plain.dispose()

    const text = createText({
      variant: variant('regular'),
      text: 'H',
      geometry: { anchor: 'baseline-left', slant: 0.25 },
    })
    // an exact variant hit contributes no synthetic slant, so the explicit one
    // is all there is — and it must apply from the first build, not just after
    // a raw swap restores it
    const asked = text.mesh.geometry.getAttribute('position').getX(0)
    expect(asked).toBeGreaterThan(noSlant)
    text.setVariant(variant('upright'))
    expect(text.mesh.geometry.getAttribute('position').getX(0)).toBeCloseTo(asked)
    text.swapFont({ font: font('raw'), map: new Texture() })
    expect(text.mesh.geometry.getAttribute('position').getX(0)).toBeCloseTo(asked)
    text.dispose()
  })

  it('adds a synthetic oblique on top of an explicitly requested slant', () => {
    const text = createText({
      variant: variant('regular'),
      text: 'H',
      geometry: { anchor: 'baseline-left', slant: 0.25 },
    })
    const asked = text.mesh.geometry.getAttribute('position').getX(0)
    text.setVariant(variant('oblique', { slant: 0.25 }))
    expect(text.mesh.geometry.getAttribute('position').getX(0)).toBeGreaterThan(asked)
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

  it('tracks atlas ownership through swaps in both directions', () => {
    // owned -> family: dispose must not touch the family's map
    const familyMap = new Texture()
    let familyDisposed = false
    familyMap.addEventListener('dispose', () => (familyDisposed = true))
    const owned = createText({ font: font('a'), map: new Texture(), text: 'H' })
    owned.setVariant({ ...variant('b'), map: familyMap })
    owned.dispose()
    expect(familyDisposed).toBe(false)

    // family -> owned: dispose must claim the raw map it was handed
    const raw = new Texture()
    let rawDisposed = false
    raw.addEventListener('dispose', () => (rawDisposed = true))
    const borrowed = createText({ variant: variant('c'), text: 'H' })
    borrowed.swapFont({ font: font('d'), map: raw })
    borrowed.dispose()
    expect(rawDisposed).toBe(true)
  })
})
