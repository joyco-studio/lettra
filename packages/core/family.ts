/* Variant resolution for font families: CSS-like nearest matching plus the
 * synthetic corrections (faux bold / faux oblique) for misses. Pure data —
 * loading and textures live in the three entry. */

import type { MSDFFont } from './types'

export type FontStyle = 'normal' | 'italic'

/** A requested variant. Defaults: weight 400, style 'normal'. */
export interface VariantKey {
  weight?: number
  style?: FontStyle
}

/** The declarative half of a family source entry — what resolution needs. */
export interface VariantDescriptor {
  weight: number
  style?: FontStyle
}

export interface SynthesisOptions {
  /** Faux-bold strength: em of stroke dilation per side per 100 weight units
   * of mismatch. Default 0.007 (≈0.021em for a 400→700 miss). */
  boldnessPerHundredWeight?: number
  /** Faux-oblique shear as tan(angle). Default tan(14°), the browsers'
   * synthetic-oblique angle. */
  slant?: number
}

/** Corrections a renderer applies on top of the nearest baked variant. */
export interface SyntheticCorrection {
  /** Stroke dilation in em per side, never negative — thinning is not
   * synthesized (it crumbles strokes), heavier bakes serve as-is instead.
   * Advances are not adjusted — a strong faux bold sits optically tighter
   * than a real bake. */
  boldness: number
  /** Shear as tan(angle); 0 when the bake already matches the requested style. */
  slant: number
}

export interface ResolvedVariant<T extends VariantDescriptor> {
  source: T
  synthetic: SyntheticCorrection
  /** True when weight and style both hit a bake exactly. */
  exact: boolean
}

export const DEFAULT_SYNTHESIS: Required<SynthesisOptions> = {
  boldnessPerHundredWeight: 0.007,
  slant: Math.tan((14 * Math.PI) / 180),
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

/** Isolated so range sources (weightRange bakes) can later match at distance
 * 0 anywhere inside their range. */
function weightDistance(source: VariantDescriptor, weight: number): number {
  return Math.abs(source.weight - weight)
}

/** Picks the baked source serving a requested variant key.
 *
 * Style first: the requested style's pool, falling back to the other style
 * (italic miss → normal bake + synthetic slant; normal miss → italic bake
 * as-is, since a bake cannot be un-slanted). Then weight, bolden-only like
 * browsers: the gap up from the nearest lighter bake is covered with
 * synthetic boldness, but thinning is never synthesized — threshold-thinning
 * crumbles strokes — so when the nearest bake is heavier (or nothing lighter
 * exists) it serves unmodified. `synthesis: false` turns any miss into a
 * throw instead. */
export function resolveVariant<T extends VariantDescriptor>(
  sources: readonly T[],
  request: VariantKey = {},
  synthesis: SynthesisOptions | false = {}
): ResolvedVariant<T> {
  if (sources.length === 0) fail('resolveVariant requires at least one source variant')
  const weight = request.weight ?? 400
  const style = request.style ?? 'normal'

  let pool = sources.filter((source) => (source.style ?? 'normal') === style)
  const styleSynthetic = pool.length === 0
  if (styleSynthetic) pool = sources.slice()

  let below: T | undefined
  let above: T | undefined
  for (const candidate of pool) {
    if (candidate.weight <= weight && (!below || candidate.weight > below.weight)) below = candidate
    if (candidate.weight > weight && (!above || candidate.weight < above.weight)) above = candidate
  }
  // nearer-lighter boldens; nearer-heavier (or no lighter bake) serves as-is
  let best: T
  if (!below) best = above!
  else if (!above) best = below
  else best = weightDistance(below, weight) <= weightDistance(above, weight) ? below : above

  const needsSlant = styleSynthetic && style === 'italic'
  const exact = best.weight === weight && !styleSynthetic

  if (!exact && synthesis === false) {
    fail(`no baked variant for weight ${weight} style ${style} (synthesis is disabled)`)
  }
  const options = synthesis === false ? DEFAULT_SYNTHESIS : { ...DEFAULT_SYNTHESIS, ...synthesis }

  return {
    source: best,
    exact,
    synthetic: {
      boldness: best.weight < weight ? ((weight - best.weight) / 100) * options.boldnessPerHundredWeight : 0,
      slant: needsSlant ? options.slant : 0,
    },
  }
}

/** The shifted iso-edge must stay inside the representable distance field. */
const MAX_THRESHOLD_SHIFT = 0.4
let warnedClamp = false

/** Converts a boldness in em (per side) into an MSDF threshold shift: the
 * field spans `distanceRange` atlas px across 0..1, so Δt = em × size /
 * distanceRange. Clamped to ±0.4 — past that the edge leaves the field (and
 * heavy dilation can bleed into neighboring atlas cells when bake padding is
 * tight). */
export function syntheticThresholdShift(boldnessEm: number, font: Pick<MSDFFont, 'size' | 'distanceRange'>): number {
  const shift = (boldnessEm * font.size) / font.distanceRange
  if (Math.abs(shift) <= MAX_THRESHOLD_SHIFT) return shift
  if (!warnedClamp) {
    warnedClamp = true
    console.warn(
      `[lettra] synthetic boldness clamped (threshold shift ${shift.toFixed(2)} exceeds ±${MAX_THRESHOLD_SHIFT}); bake a closer weight or raise the bake's distance range`
    )
  }
  return Math.sign(shift) * MAX_THRESHOLD_SHIFT
}
