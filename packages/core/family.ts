/* CSS-like variant resolution plus the synthetic oblique for italic misses.
 * Pure data; loading and textures live in the three entry. */

export type FontStyle = 'normal' | 'italic'

/** A requested variant. Defaults: weight 400, style 'normal'. */
export interface VariantKey {
  weight?: number
  style?: FontStyle
}

/** The declarative half of a family source entry. */
export interface VariantDescriptor {
  weight: number
  style?: FontStyle
}

export interface SynthesisOptions {
  /** Shear as tan(angle). Default tan(14°), matching browsers. */
  slant?: number
}

/** Applied on top of the serving baked variant. */
export interface SyntheticCorrection {
  /** Shear as tan(angle); 0 when the bake already matches the style. */
  slant: number
}

export interface ResolvedVariant<T extends VariantDescriptor> {
  source: T
  synthetic: SyntheticCorrection
  /** True when weight and style both hit a bake exactly. */
  exact: boolean
}

export const DEFAULT_SYNTHESIS: Required<SynthesisOptions> = {
  slant: Math.tan((14 * Math.PI) / 180),
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

/** Nearest candidate in one direction, `weight` itself included or not. */
function nearest<T extends VariantDescriptor>(
  pool: readonly T[],
  weight: number,
  direction: 'up' | 'down',
  inclusive: boolean
): T | undefined {
  let best: T | undefined
  for (const candidate of pool) {
    const eligible =
      direction === 'up'
        ? inclusive
          ? candidate.weight >= weight
          : candidate.weight > weight
        : inclusive
          ? candidate.weight <= weight
          : candidate.weight < weight
    if (!eligible) continue
    if (!best || (direction === 'up' ? candidate.weight < best.weight : candidate.weight > best.weight)) {
      best = candidate
    }
  }
  return best
}

/** CSS Fonts 4 weight matching: above 500 search heavier first, below 400
 * lighter first, and inside 400..500 climb only as far as 500 before falling
 * back to lighter bakes. */
function pickWeight<T extends VariantDescriptor>(pool: readonly T[], weight: number): T {
  if (weight > 500) return (nearest(pool, weight, 'up', true) ?? nearest(pool, weight, 'down', false))!
  if (weight < 400) return (nearest(pool, weight, 'down', true) ?? nearest(pool, weight, 'up', false))!
  const up = nearest(pool, weight, 'up', true)
  if (up && up.weight <= 500) return up
  return (nearest(pool, weight, 'down', false) ?? up)!
}

/** Style first (a bake cannot be un-slanted, so a normal request served by an
 * italic-only family keeps the slant), then weight per `pickWeight`. A weight
 * the family has no bake for serves its neighbour unmodified: weight is never
 * synthesized, only the oblique is. */
export function resolveVariant<T extends VariantDescriptor>(
  sources: readonly T[],
  request: VariantKey = {},
  synthesis: SynthesisOptions | false = {}
): ResolvedVariant<T> {
  if (sources.length === 0) fail('resolveVariant requires at least one source variant')
  const weight = request.weight ?? 400
  const style = request.style ?? 'normal'
  // every comparison against NaN is false, so the search would come back empty
  if (!Number.isFinite(weight)) fail(`weight must be a finite number, got ${weight}`)

  let pool = sources.filter((source) => (source.style ?? 'normal') === style)
  const styleSynthetic = pool.length === 0
  if (styleSynthetic) pool = sources.slice()

  const best = pickWeight(pool, weight)

  const needsSlant = styleSynthetic && style === 'italic'
  const exact = best.weight === weight && !styleSynthetic

  if (!exact && synthesis === false) {
    fail(`no baked variant for weight ${weight} style ${style} (synthesis is disabled)`)
  }
  const options = synthesis === false ? DEFAULT_SYNTHESIS : { ...DEFAULT_SYNTHESIS, ...synthesis }

  return {
    source: best,
    exact,
    synthetic: { slant: needsSlant ? options.slant : 0 },
  }
}
