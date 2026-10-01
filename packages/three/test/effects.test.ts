import { describe, expect, it } from 'vitest'
import { float, vec2 } from 'three/tsl'
import { composeEffects, glyphRects, scramble, wipe } from '../index'
import type { MSDFFont } from '../../core/types'

const FONT: MSDFFont = {
  name: 'mono',
  size: 64,
  lineHeight: 80,
  base: 60,
  distanceRange: 8,
  atlas: { width: 256, height: 128 },
  glyphs: {
    A: [0, 0, 32, 64, 0, 0, 40],
    B: [32, 0, 32, 64, 0, 0, 40],
    ' ': [64, 0, 0, 0, 0, 0, 40],
  },
  kerning: {},
}

describe('scramble effect', () => {
  it('builds normalized v-down atlas rects, skipping missing and inkless chars', () => {
    const rects = glyphRects(FONT, 'AB? ')
    expect(rects).toHaveLength(2)
    expect(rects[0].toArray()).toEqual([0, 0, 32 / 256, 64 / 128])
    expect(rects[1].toArray()).toEqual([32 / 256, 0, 32 / 256, 64 / 128])
  })

  it('exposes the scramble uniform, a uv hook, and a capacity-bound setPool', () => {
    const effect = scramble({ font: FONT, chars: 'AB', capacity: 4 })
    expect(Object.keys(effect.uniforms)).toEqual(['scramble'])
    expect(effect.uniforms.scramble.value).toBe(0)

    const remapped = effect.uv({ uv: vec2(0.5, 0.5) })
    expect((remapped as { isNode?: boolean }).isNode).toBe(true)

    effect.setPool(FONT, 'A')
    expect(() => scramble({ font: FONT, chars: '?' })).toThrow(/pool is empty/)
  })

  it('accepts a drive combinator receiving the scramble uniform', () => {
    let received: unknown
    const effect = scramble({
      font: FONT,
      drive: (base) => {
        received = base
        return base
      },
    })
    expect(received).toBe(effect.uniforms.scramble)
  })
})

describe('composeEffects', () => {
  it('merges uniforms and stacks hooks from every effect', () => {
    const composed = composeEffects(wipe(), scramble({ font: FONT, chars: 'AB' }))
    expect(Object.keys(composed.uniforms).sort()).toEqual(['scramble', 'wipeIn', 'wipeOut'])

    const uv = composed.uv!({ uv: vec2(0.5, 0.5) })
    const erosion = composed.erosion!({ distance: float(0.5), aa: float(0.01) })
    expect((uv as { isNode?: boolean }).isNode).toBe(true)
    expect((erosion as { isNode?: boolean }).isNode).toBe(true)
  })

  it('omits hooks no composed effect provides', () => {
    const composed = composeEffects(wipe())
    expect(composed.uv).toBeUndefined()
    expect(composed.erosion).toBeDefined()
  })
})
