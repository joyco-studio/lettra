import { textStageOrder } from '../material'
import type { TextEffect, TextStageTransforms } from '../material'

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never

/** The merged uniform bag of a composed effect tuple. */
export type ComposedUniforms<E extends readonly TextEffect[]> = UnionToIntersection<E[number]['uniforms']> & object

/** The effect type `composeEffects` returns — name composed handles with it:
 * `TextHandle<ComposedEffect<[WipeEffect, ScrambleEffect]>>`. */
export type ComposedEffect<E extends readonly TextEffect[]> = TextEffect<ComposedUniforms<E>>

/** Folds every effect's transform for one wire into a single transform,
 * left → right, each seeing the previous value. */
function chainStage<K extends keyof TextStageTransforms>(
  effects: readonly TextEffect[],
  key: K
): TextStageTransforms[K] | undefined {
  const hooks = effects.flatMap((effect) => effect.stages?.[key] ?? [])
  if (hooks.length === 0) return undefined
  const chained = (prev: unknown, ctx: unknown) =>
    hooks.reduce((value, hook) => (hook as (p: unknown, c: unknown) => unknown)(value, ctx), prev)
  return chained as TextStageTransforms[K]
}

/** Stacks effects into one: uniforms merge (later keys win) and each wire's
 * transforms chain left → right — add vs replace is each effect's own node
 * math, so no per-wire merge rules live here. Each effect keeps owning its
 * uniforms, so instances stay shareable across materials. */
export function composeEffects<const E extends readonly TextEffect[]>(...effects: E): ComposedEffect<E> {
  const stages: TextStageTransforms = {}
  for (const key of textStageOrder) {
    const chained = chainStage(effects, key)
    if (chained) (stages as Record<string, unknown>)[key] = chained
  }
  return {
    uniforms: Object.assign({}, ...effects.map((effect) => effect.uniforms)) as ComposedUniforms<E>,
    // one font-bound member binds the whole stack: its stage runs on every
    // mesh the composition is attached to
    ...(effects.some((effect) => effect.fontBound) && { fontBound: true }),
    ...(Object.keys(stages).length > 0 && { stages }),
  }
}
