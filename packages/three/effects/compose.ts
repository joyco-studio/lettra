import { saturate } from 'three/tsl'
import type { FloatNode, TextEffect, TextEffectContext, TextEffectUvContext, Vec2Node } from '../material'

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never

/** The merged uniform bag of a composed effect tuple. */
export type ComposedUniforms<E extends readonly TextEffect[]> = UnionToIntersection<E[number]['uniforms']> & object

/** Stacks effects into one: uniforms merge (later keys win), `uv` remaps
 * chain left → right, and erosions add (clamped to 1). Each effect keeps
 * owning its uniforms, so instances stay shareable across materials. */
export function composeEffects<const E extends readonly TextEffect[]>(...effects: E): TextEffect<ComposedUniforms<E>> {
  const uvHooks = effects.filter((effect) => effect.uv)
  const erosionHooks = effects.filter((effect) => effect.erosion)

  return {
    uniforms: Object.assign({}, ...effects.map((effect) => effect.uniforms)) as ComposedUniforms<E>,
    ...(uvHooks.length > 0 && {
      uv: (context: TextEffectUvContext): Vec2Node => uvHooks.reduce((uv, effect) => effect.uv!({ uv }), context.uv),
    }),
    ...(erosionHooks.length > 0 && {
      erosion: (context: TextEffectContext): FloatNode =>
        saturate(
          erosionHooks
            .map((effect) => effect.erosion!(context))
            .reduce((total, erosion) => total.add(erosion) as FloatNode)
        ),
    }),
  }
}
