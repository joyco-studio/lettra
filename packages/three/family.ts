import type { Texture, WebGPURenderer } from 'three/webgpu'
import { loadFont } from '../core/parse'
import { resolveVariant } from '../core/family'
import type { FontStyle, SynthesisOptions, SyntheticCorrection, VariantKey } from '../core/family'
import { experimental_interpolateFont } from '../core/variable'
import type { MSDFFont } from '../core/types'
import { experimental_loadDeltaFontTexture, loadFontTexture } from './texture'

/** `weight` declares a static bake; `weightRange` an experimental
 * delta-channel bake covering a continuous span. */
export type FamilyVariantSource = {
  json: string
  atlas: string
  style?: FontStyle
} & ({ weight: number; weightRange?: never } | { weightRange: [number, number]; weight?: never })

export type VariantState = 'idle' | 'loading' | 'loaded' | 'error'

export interface FamilyVariant {
  readonly source: FamilyVariantSource
  /** Static weight, or the range midpoint for delta bakes. */
  readonly weight: number
  /** Present for delta-channel bakes. */
  readonly weightRange?: [number, number]
  readonly style: FontStyle
  readonly state: VariantState
  readonly error?: Error
}

/** Feed to `createText({ variant })` or `text.setVariant`. The map is
 * family-owned; texts never dispose it. */
export interface LoadedVariant {
  font: MSDFFont
  map: Texture
  /** The baked weight serving the request (clamped in-range for delta bakes). */
  weight: number
  style: FontStyle
  /** Zeros on an exact hit. */
  synthetic: SyntheticCorrection
  /** EXPERIMENTAL: interpolation t for delta-channel bakes. */
  weightT?: number
}

export interface DefineFamilyOptions {
  src: FamilyVariantSource[]
  /** `false` → resolution misses throw instead of synthesizing. */
  synthesis?: SynthesisOptions | false
  /** Transport seam (tests, KTX2…). */
  loaders?: {
    font?: (url: string) => Promise<MSDFFont>
    texture?: (url: string, delta: boolean) => Promise<Texture>
  }
}

export interface FontFamily {
  readonly variants: readonly FamilyVariant[]
  /** Sorted unique declared weights; range bakes contribute their endpoints. */
  readonly weights: number[]
  readonly styles: FontStyle[]
  /** Exact bakes only; inside a declared range counts. */
  has(key?: VariantKey): boolean
  /** Resolves, loads the serving bake, returns it with corrections.
   * Concurrent loads of one bake share a request. */
  load(key?: VariantKey): Promise<LoadedVariant>
  /** Loads every declared bake (optionally filtered). Results are exact. */
  loadAll(filter?: (variant: FamilyVariant) => boolean): Promise<LoadedVariant[]>
  /** Sync resolution; null until the serving bake is loaded. */
  get(key?: VariantKey): LoadedVariant | null
  /** Uploads loaded atlases; pipeline compile stays on `text.warmup`. */
  warmup(renderer: WebGPURenderer): void
  /** Disposes family-owned textures and resets to idle; reusable after. */
  dispose(): void
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

interface Slot {
  source: FamilyVariantSource
  style: FontStyle
  state: VariantState
  error?: Error
  pending?: Promise<{ font: MSDFFont; map: Texture }>
  result?: { font: MSDFFont; map: Texture }
}

/** Range bakes clamp the request into their span, so in-range requests match
 * at distance 0 and out-of-range ones compete from the nearest endpoint. */
function toDescriptor(slot: Slot, requestedWeight: number) {
  const { source } = slot
  const weight = source.weightRange
    ? Math.min(source.weightRange[1], Math.max(source.weightRange[0], requestedWeight))
    : source.weight
  return { weight, style: slot.style, slot }
}

export function defineFamily(options: DefineFamilyOptions): FontFamily {
  if (!options.src || options.src.length === 0) fail('defineFamily requires at least one src entry')

  const loadFontJson = options.loaders?.font ?? loadFont
  const loadAtlas =
    options.loaders?.texture ??
    ((url: string, delta: boolean) => (delta ? experimental_loadDeltaFontTexture(url) : loadFontTexture(url)))

  const slots: Slot[] = options.src.map((source) => ({ source, style: source.style ?? 'normal', state: 'idle' }))
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      const aKey = a.source.weightRange ? `r${a.source.weightRange.join('-')}` : `w${a.source.weight}`
      const bKey = b.source.weightRange ? `r${b.source.weightRange.join('-')}` : `w${b.source.weight}`
      if (aKey === bKey && a.style === b.style) fail(`duplicate variant ${aKey.slice(1)} ${a.style}`)
    }
  }

  let warnedMixedBakes = false
  const checkBakeConsistency = () => {
    if (warnedMixedBakes) return
    const loaded = slots.filter((slot) => slot.result).map((slot) => slot.result!.font)
    if (loaded.length < 2) return
    const [first, ...rest] = loaded
    const sizeMismatch = rest.some((font) => font.size !== first.size)
    const ratioMismatch = rest.some((font) => Math.abs(font.base / font.size - first.base / first.size) > 0.02)
    if (sizeMismatch || ratioMismatch) {
      warnedMixedBakes = true
      console.warn(
        '[lettra] family variants were baked inconsistently (size or baseline ratio differs); letterSpacing/maxWidth/lineHeight options will mean different things per variant and baselines may shift on swap; rebake every variant at one size'
      )
    }
  }

  // bumped by dispose() so loads started before it can't resurrect the family
  let generation = 0

  const ensureLoaded = (slot: Slot): Promise<{ font: MSDFFont; map: Texture }> => {
    if (slot.pending) return slot.pending
    const startedAt = generation
    slot.state = 'loading'
    slot.error = undefined
    const delta = slot.source.weightRange !== undefined
    const pending = Promise.all([loadFontJson(slot.source.json), loadAtlas(slot.source.atlas, delta)]).then(
      ([font, map]) => {
        if (startedAt !== generation) {
          map.dispose()
          return { font, map }
        }
        slot.result = { font, map }
        slot.state = 'loaded'
        checkBakeConsistency()
        return slot.result
      }
    )
    pending.catch((error) => {
      if (startedAt !== generation) return
      // evict so a retry reloads; keep the error for introspection
      slot.pending = undefined
      slot.state = 'error'
      slot.error = error instanceof Error ? error : new Error(String(error))
    })
    slot.pending = pending
    return pending
  }

  const resolveSlot = (key: VariantKey = {}) => {
    const weight = key.weight ?? 400
    const descriptors = slots.map((slot) => toDescriptor(slot, weight))
    const resolved = resolveVariant(descriptors, key, options.synthesis)
    const slot = resolved.source.slot
    const weightT = slot.source.weightRange
      ? (resolved.source.weight - slot.source.weightRange[0]) /
        (slot.source.weightRange[1] - slot.source.weightRange[0])
      : undefined
    return { slot, resolved, weightT }
  }

  const toLoaded = (
    slot: Slot,
    result: { font: MSDFFont; map: Texture },
    synthetic: SyntheticCorrection,
    weightT: number | undefined,
    servedWeight: number
  ): LoadedVariant => ({
    // interpolate layout metrics at the serving t; the atlas is shared
    font: weightT !== undefined ? experimental_interpolateFont(result.font, weightT) : result.font,
    map: result.map,
    weight: servedWeight,
    style: slot.style,
    synthetic,
    ...(weightT !== undefined ? { weightT } : {}),
  })

  const family: FontFamily = {
    get variants() {
      return slots.map((slot) => ({
        source: slot.source,
        weight: slot.source.weightRange
          ? (slot.source.weightRange[0] + slot.source.weightRange[1]) / 2
          : slot.source.weight,
        ...(slot.source.weightRange ? { weightRange: slot.source.weightRange } : {}),
        style: slot.style,
        state: slot.state,
        error: slot.error,
      }))
    },
    get weights() {
      const weights = new Set<number>()
      for (const slot of slots) {
        if (slot.source.weightRange) {
          weights.add(slot.source.weightRange[0])
          weights.add(slot.source.weightRange[1])
        } else {
          weights.add(slot.source.weight)
        }
      }
      return [...weights].sort((a, b) => a - b)
    },
    get styles() {
      return [...new Set(slots.map((slot) => slot.style))]
    },
    has(key = {}) {
      const weight = key.weight ?? 400
      const style = key.style ?? 'normal'
      return slots.some((slot) => {
        if (slot.style !== style) return false
        if (slot.source.weightRange) {
          return weight >= slot.source.weightRange[0] && weight <= slot.source.weightRange[1]
        }
        return slot.source.weight === weight
      })
    },
    async load(key = {}) {
      const { slot, resolved, weightT } = resolveSlot(key)
      const result = await ensureLoaded(slot)
      return toLoaded(slot, result, resolved.synthetic, weightT, resolved.source.weight)
    },
    async loadAll(filter) {
      const snapshot = filter ? family.variants : []
      const chosen = filter ? slots.filter((_slot, i) => filter(snapshot[i])) : slots
      return Promise.all(
        chosen.map(async (slot) => {
          const result = await ensureLoaded(slot)
          const weightT = slot.source.weightRange ? 0 : undefined
          const weight = slot.source.weightRange ? slot.source.weightRange[0] : slot.source.weight
          return toLoaded(slot, result, { boldness: 0, slant: 0 }, weightT, weight)
        })
      )
    },
    get(key = {}) {
      const { slot, resolved, weightT } = resolveSlot(key)
      if (!slot.result) return null
      return toLoaded(slot, slot.result, resolved.synthetic, weightT, resolved.source.weight)
    },
    warmup(renderer) {
      for (const slot of slots) {
        if (slot.result) renderer.initTexture(slot.result.map)
      }
    },
    dispose() {
      generation++
      for (const slot of slots) {
        slot.result?.map.dispose()
        slot.result = undefined
        slot.pending = undefined
        slot.state = 'idle'
        slot.error = undefined
      }
      warnedMixedBakes = false
    },
  }

  return family
}
