import { describe, expect, it } from 'vitest'
import { float, vec4 } from 'three/tsl'
import {
  createTextUniforms,
  defineNode,
  experimental_msdfDeltaDistance,
  msdfAA,
  msdfBolden,
  msdfDistance,
  msdfFill,
  msdfThreshold,
  wipe,
  wipeErosion,
} from '../index'
import type { NodeInputs } from '../index'

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
    expect(msdfBolden.definition.inputs).toEqual({ threshold: 'float', boldness: 'float' })
    expect(experimental_msdfDeltaDistance.definition.inputs).toEqual({
      msdf: 'vec4',
      weightT: 'float',
      deltaScale: 'float',
    })
    for (const node of [
      msdfDistance,
      msdfAA,
      msdfFill,
      msdfThreshold,
      msdfBolden,
      experimental_msdfDeltaDistance,
      wipeErosion,
    ]) {
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
    const bolded = msdfBolden({ threshold: msdfThreshold({ erosion, aa }), boldness: float(0.1) })
    const coverage = msdfFill({ distance, threshold: bolded, aa })
    const deltaDistance = experimental_msdfDeltaDistance({
      msdf: vec4(0.2, 0.5, 0.8, 0.5),
      weightT: float(0.5),
      deltaScale: float(2),
    })
    for (const node of [distance, aa, erosion, bolded, coverage, deltaDistance]) {
      expect(node).toBeDefined()
      expect((node as { isNode?: boolean }).isNode).toBe(true)
    }
  })

  it('keeps the base uniform bag lean; wipe lands as an opt-in effect', () => {
    expect(Object.keys(createTextUniforms())).toEqual(['fill', 'opacity', 'boldness'])
    expect(createTextUniforms().boldness.value).toBe(0)

    const effect = wipe()
    expect(Object.keys(effect.uniforms)).toEqual(['wipeIn', 'wipeOut'])
    expect(effect.uniforms.wipeIn.value).toBe(1)
    expect(effect.uniforms.wipeOut.value).toBe(0)

    const erosion = effect.erosion()
    expect((erosion as { isNode?: boolean }).isNode).toBe(true)
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
