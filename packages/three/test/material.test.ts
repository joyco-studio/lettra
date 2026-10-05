import { describe, expect, it } from 'vitest'
import { color, float, mix, vec4 } from 'three/tsl'
import { Texture } from 'three/webgpu'
import {
  buildTextGraph,
  createTextUniforms,
  defineNode,
  msdfAA,
  msdfDistance,
  msdfFill,
  msdfThreshold,
  wipe,
  wipeErosion,
} from '../index'
import type { NodeInputs, TextEffect } from '../index'

describe('node contracts', () => {
  it('exposes frozen runtime definitions matching the declared contract', () => {
    expect(wipeErosion.definition).toEqual({
      name: 'wipeErosion',
      inputs: { wipeIn: 'float', wipeOut: 'float', coord: 'float', band: 'float' },
      output: 'float',
    })
    expect(Object.isFrozen(wipeErosion.definition)).toBe(true)
    expect(Object.isFrozen(wipeErosion.definition.inputs)).toBe(true)
    expect(msdfDistance.definition.inputs).toEqual({ msdf: 'vec4' })
    for (const node of [msdfDistance, msdfAA, msdfFill, msdfThreshold, wipeErosion]) {
      expect(node.definition.output).toBe('float')
      expect(typeof node.definition.name).toBe('string')
    }
  })

  it('builds composable float nodes from complete input bags', () => {
    const distance = msdfDistance({ msdf: vec4(0.2, 0.5, 0.8, 1) })
    const aa = msdfAA({ distance })
    const erosionInputs = {
      wipeIn: float(1),
      wipeOut: float(0),
      coord: float(0.5),
      band: float(0.25),
    } satisfies NodeInputs<typeof wipeErosion>
    const erosion = wipeErosion(erosionInputs)
    const coverage = msdfFill({ distance, threshold: msdfThreshold({ erosion, aa }), aa })
    for (const node of [distance, aa, erosion, coverage]) {
      expect(node).toBeDefined()
      expect((node as { isNode?: boolean }).isNode).toBe(true)
    }
  })

  it('keeps the base uniform bag lean; wipe lands as an opt-in effect', () => {
    expect(Object.keys(createTextUniforms())).toEqual(['fill', 'opacity'])

    const effect = wipe()
    expect(Object.keys(effect.uniforms)).toEqual(['wipeIn', 'wipeOut'])
    expect(effect.uniforms.wipeIn.value).toBe(1)
    expect(effect.uniforms.wipeOut.value).toBe(0)

    const erosion = effect.stages.erosion(float(0))
    expect((erosion as { isNode?: boolean }).isNode).toBe(true)
  })

  it('exposes every graph stage as plain TSL nodes', () => {
    const plain = buildTextGraph({ map: new Texture() })
    for (const stage of [
      plain.uv,
      plain.textureNode,
      plain.distance,
      plain.aa,
      plain.threshold,
      plain.coverage,
      plain.color,
      plain.opacity,
    ]) {
      expect((stage as { isNode?: boolean }).isNode).toBe(true)
    }
    expect(plain.erosion).toBeUndefined()

    const eroded = buildTextGraph({ map: new Texture(), effect: wipe() })
    expect((eroded.erosion as { isNode?: boolean }).isNode).toBe(true)
  })

  it('resolves color and opacity wires through effect transforms', () => {
    const seen: string[] = []
    const effect: TextEffect = {
      uniforms: {},
      stages: {
        color: (prev, ctx) => {
          seen.push('color')
          expect((ctx.erosion as { isNode?: boolean }).isNode).toBe(true)
          expect((ctx.coverage as { isNode?: boolean }).isNode).toBe(true)
          return mix(prev, color('#1d3557'), ctx.coverage)
        },
        opacity: (prev) => {
          seen.push('opacity')
          return prev.mul(0.5)
        },
      },
    }
    const graph = buildTextGraph({ map: new Texture(), effect })
    expect(seen).toEqual(['color', 'opacity'])
    expect((graph.color as { isNode?: boolean }).isNode).toBe(true)
    expect((graph.opacity as { isNode?: boolean }).isNode).toBe(true)
  })

  it('rejects incomplete or mistyped input bags at compile time', () => {
    const contract = defineNode(
      { name: 'probe', inputs: { a: 'float', b: 'vec4' }, output: 'float' }, //
      ({ a }) => a
    )
    expect(contract.definition.name).toBe('probe')
    // @ts-expect-error missing input `b`
    const incomplete: NodeInputs<typeof contract> = { a: float(1) }
    expect(incomplete).toBeDefined()
    // @ts-expect-error `b` must be a vec4 node, not a float node
    const mistyped: NodeInputs<typeof contract> = { a: float(1), b: float(1) }
    expect(mistyped).toBeDefined()
  })
})
