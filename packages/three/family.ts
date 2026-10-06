import type { Texture, WebGPURenderer } from 'three/webgpu'
import { loadFont } from '../core/parse'
import { resolveVariant } from '../core/family'
import type { FontStyle, SynthesisOptions, SyntheticCorrection, VariantKey } from '../core/family'
import type { MSDFFont } from '../core/types'
import { loadFontTexture } from './texture'

export interface FamilyVariantSource {
  json: string
  atlas: string
  weight: number
  style?: FontStyle
}

export type VariantState = 'idle' | 'loading' | 'loaded' | 'error'

export interface FamilyVariant {
  readonly source: FamilyVariantSource
  readonly weight: number
  readonly style: FontStyle
  readonly state: VariantState
  readonly error?: Error
}

/** Feed to `createText({ variant })` or `text.setVariant`. The map is
 * family-owned; texts never dispose it. */
export interface LoadedVariant {
  font: MSDFFont
  map: Texture
  /** The baked weight serving the request. */
  weight: number
  style: FontStyle
  /** Zeros on an exact hit. */
  synthetic: SyntheticCorrection
}

export interface DefineFamilyOptions {
  src: FamilyVariantSource[]
  /** `false` → resolution misses throw instead of serving a neighbouring
   * bake or a sheared oblique. */
  synthesis?: SynthesisOptions | false
  /** Transport seam (tests, KTX2…). `texture` must hand back a texture this
   * family alone owns: a load whose font failed, or one `dispose()` outran,
   * frees its atlas, so a shared cache would lose it under its other holders. */
  loaders?: {
    font?: (url: string) => Promise<MSDFFont>
    texture?: (url: string) => Promise<Texture>
  }
}

export interface FontFamily {
  readonly variants: readonly FamilyVariant[]
  /** Sorted unique declared weights. */
  readonly weights: number[]
  readonly styles: FontStyle[]
  /** Exact bakes only. */
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

export function defineFamily(options: DefineFamilyOptions): FontFamily {
  if (!options.src || options.src.length === 0) fail('defineFamily requires at least one src entry')

  const loadFontJson = options.loaders?.font ?? loadFont
  const loadAtlas = options.loaders?.texture ?? loadFontTexture

  const slots: Slot[] = options.src.map((source) => ({ source, style: source.style ?? 'normal', state: 'idle' }))
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      if (a.source.weight === b.source.weight && a.style === b.style) {
        fail(`duplicate variant ${a.source.weight} ${a.style}`)
      }
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
    const fontRequest = loadFontJson(slot.source.json)
    const atlasRequest = loadAtlas(slot.source.atlas)
    // the font is awaited first, so claim the atlas's rejection now: a fast
    // atlas failure would otherwise sit unhandled until the await reaches it.
    // Attaching this doesn't consume it — the await below still rejects.
    atlasRequest.catch(() => {})
    // an atlas whose font failed is ours to free: nothing else will ever see
    // it. Fire-and-forget, so a slow atlas can't hold back the font's failure.
    const freeOrphan = () =>
      void atlasRequest.then(
        (map) => map.dispose(),
        () => {}
      )

    const pending = (async () => {
      let font: MSDFFont
      try {
        font = await fontRequest
      } catch (error) {
        freeOrphan()
        throw error
      }
      const map = await atlasRequest
      // one dispose() already killed this family: the atlas is ours to free too
      if (startedAt !== generation) {
        map.dispose()
        fail(`family was disposed while variant ${slot.source.weight} ${slot.style} was loading`)
      }
      slot.result = { font, map }
      slot.state = 'loaded'
      checkBakeConsistency()
      return slot.result
    })()
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
    const descriptors = slots.map((slot) => ({ weight: slot.source.weight, style: slot.style, slot }))
    const resolved = resolveVariant(descriptors, key, options.synthesis)
    return { slot: resolved.source.slot, resolved }
  }

  const toLoaded = (
    slot: Slot,
    result: { font: MSDFFont; map: Texture },
    synthetic: SyntheticCorrection,
    servedWeight: number
  ): LoadedVariant => ({
    font: result.font,
    map: result.map,
    weight: servedWeight,
    style: slot.style,
    synthetic,
  })

  const family: FontFamily = {
    get variants() {
      return slots.map((slot) => ({
        source: slot.source,
        weight: slot.source.weight,
        style: slot.style,
        state: slot.state,
        error: slot.error,
      }))
    },
    get weights() {
      return [...new Set(slots.map((slot) => slot.source.weight))].sort((a, b) => a - b)
    },
    get styles() {
      return [...new Set(slots.map((slot) => slot.style))]
    },
    has(key = {}) {
      const weight = key.weight ?? 400
      const style = key.style ?? 'normal'
      return slots.some((slot) => slot.style === style && slot.source.weight === weight)
    },
    async load(key = {}) {
      const { slot, resolved } = resolveSlot(key)
      const result = await ensureLoaded(slot)
      return toLoaded(slot, result, resolved.synthetic, resolved.source.weight)
    },
    async loadAll(filter) {
      const snapshot = filter ? family.variants : []
      const chosen = filter ? slots.filter((_slot, i) => filter(snapshot[i])) : slots
      return Promise.all(
        chosen.map(async (slot) => {
          const result = await ensureLoaded(slot)
          return toLoaded(slot, result, { slant: 0 }, slot.source.weight)
        })
      )
    },
    get(key = {}) {
      const { slot, resolved } = resolveSlot(key)
      if (!slot.result) return null
      return toLoaded(slot, slot.result, resolved.synthetic, resolved.source.weight)
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
