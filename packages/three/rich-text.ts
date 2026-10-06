/* One paragraph, several family variants (italic or weight spans). One mesh per variant
 * bucket under a Group; wrapping and the wipe span stay paragraph-wide. */

import { Group, Mesh } from 'three/webgpu'
import type { Camera, Material, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import { layoutRuns } from '../core/runs'
import type { RunsLayoutResult } from '../core/runs'
import type { VariantKey } from '../core/family'
import type { LayoutGlyph, LayoutOptions, LayoutResult, MSDFFont } from '../core/types'
import type { FontFamily, LoadedVariant } from './family'
import { buildTextGeometry } from './geometry'
import type { TextGeometryOptions } from './geometry'
import { createTextMaterial, createTextUniforms } from './material'
import type { EffectUniforms, TextEffect, TextMaterialOptions, TextUniforms } from './material'
import { warmup } from './lifecycle'

export interface RichSpan extends VariantKey {
  /** [start, end). Must not overlap, and must cover at least one character;
   * gaps use the base `variant` key. */
  start: number
  end: number
}

export interface CreateRichTextOptions<E extends TextEffect | undefined = undefined> {
  family: FontFamily
  text: string
  spans?: RichSpan[]
  /** Base variant for text outside any span. Default weight 400 normal. */
  variant?: VariantKey
  layout?: LayoutOptions
  geometry?: Omit<TextGeometryOptions, 'bounds' | 'glyphIndexOf' | 'slant'>
  /** Shared across bucket materials. A paragraph-wide effect (`wipe`) rides
   * every bucket. One that declares `fontBound` (`scramble`, whose rects come
   * from a single atlas) rides only the buckets drawing the base variant's
   * font, since elsewhere it would sample the wrong texture with those rects;
   * the rest render the text without it. */
  material?: Omit<TextMaterialOptions<E>, 'map' | 'uniforms'>
}

export interface RichTextHandle<E extends TextEffect | undefined = undefined> {
  /** One child mesh per variant bucket. */
  group: Group
  /** Shared across every bucket. */
  uniforms: TextUniforms & EffectUniforms<E>
  readonly layout: RunsLayoutResult
  setText(text: string, spans?: RichSpan[], layoutOptions?: LayoutOptions): void
  warmup(renderer: WebGPURenderer, camera: Camera, scene?: Scene): Promise<void>
  onChange(listener: () => void): () => void
  /** Maps are family-owned: left alone unless `{ maps: true }`. */
  dispose(options?: { maps?: boolean }): void
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

interface RunKey extends VariantKey {
  start: number
  end: number
  /** True for the gaps between spans, which carry the base key. */
  base: boolean
}

/** Sorts spans and fills gaps with the base key so runs tile the text. */
function normalizeRuns(length: number, spans: RichSpan[], base: VariantKey): RunKey[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const runs: RunKey[] = []
  let cursor = 0
  for (const span of sorted) {
    // an empty span places no glyphs but would still get a run, and run 0 sets
    // the paragraph's reference size
    if (span.end <= span.start) fail('rich-text spans must cover at least one character')
    if (span.start < cursor) fail('rich-text spans must not overlap')
    if (span.end > length) fail('rich-text span exceeds the text length')
    if (span.start > cursor) runs.push({ ...base, start: cursor, end: span.start, base: true })
    runs.push({ ...span, base: false })
    cursor = span.end
  }
  if (cursor < length) runs.push({ ...base, start: cursor, end: length, base: true })
  return runs
}

/** One bake serving both: same font, atlas and slant, so the two would have
 * shared a draw call anyway. */
const sameBake = (a: LoadedVariant, b: LoadedVariant) =>
  a.font === b.font && a.map === b.map && a.synthetic.slant === b.synthetic.slant

export function createRichText<E extends TextEffect | undefined = undefined>(
  options: CreateRichTextOptions<E>
): RichTextHandle<E> {
  const { family } = options
  let text = options.text
  let spans = options.spans ?? []
  let layoutOptions = options.layout
  const baseKey = options.variant ?? {}
  const geometryOptions = options.geometry

  const sharedUniforms = createTextUniforms(options.material)
  const effect = options.material?.effect
  // scramble reads one atlas's glyph rects; wipe only reads layoutX
  const fontBound = effect?.fontBound === true
  let warnedUnanchoredEffect = false

  const group = new Group()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  let currentLayout!: RunsLayoutResult
  // our own list, not group.children: the group is public, and a caller's debug
  // helper added to it is not ours to dispose
  let meshes: Mesh[] = []
  let maps: Texture[] = []
  // one material per (atlas, effect) pair, kept across builds — setText must not
  // throw away the pipeline warmup() just compiled
  const materials = new Map<string, Material>()

  const materialFor = (map: Texture, withEffect: boolean): Material => {
    // with no effect to attach there is nothing to vary, so one per atlas
    const attach = effect !== undefined && withEffect
    const key = `${map.id}:${attach ? 1 : 0}`
    const cached = materials.get(key)
    if (cached) return cached
    // one shared uniform bag, so a tween moves every bucket at once
    const { material } = createTextMaterial({
      map,
      effect: attach ? effect : undefined,
      uniforms: sharedUniforms,
    } as TextMaterialOptions<E>)
    materials.set(key, material)
    return material
  }

  const clearMeshes = () => {
    for (const mesh of meshes) {
      mesh.geometry.dispose()
      group.remove(mesh)
    }
    meshes = []
  }

  const build = (nextText: string, nextSpans: RichSpan[], nextLayoutOptions: LayoutOptions | undefined) => {
    const keys = normalizeRuns(nextText.length, nextSpans, baseKey)
    // empty text tiles into nothing; keep one empty run so '' still builds
    if (keys.length === 0) keys.push({ ...baseKey, start: 0, end: 0, base: true })

    const resolved = keys.map((key) => {
      const variant = family.get(key)
      if (!variant) {
        fail(
          `variant weight ${key.weight ?? 400} style ${key.style ?? 'normal'} is not loaded; await family.load or loadAll first`
        )
      }
      return variant
    })

    // adjacent runs resolving to one bake are one run: layoutRuns drops kerning
    // at every boundary, and across these two it is the same pair table — a span
    // that changes nothing would otherwise shift the text it precedes
    const runs: Array<{ start: number; end: number }> = []
    const variants: LoadedVariant[] = []
    keys.forEach((key, i) => {
      const last = runs[runs.length - 1]
      if (last && sameBake(variants[variants.length - 1], resolved[i])) {
        last.end = key.end
        return
      }
      runs.push({ start: key.start, end: key.end })
      variants.push(resolved[i])
    })

    const nextLayout = layoutRuns(
      nextText,
      runs.map((run, i) => ({ font: variants[i].font, start: run.start, end: run.end })),
      nextLayoutOptions
    )

    // A font-bound effect was built from the base variant's font, so resolve
    // that key — never infer it from the runs, which may not include the base
    // variant at all when spans tile the whole text.
    // undefined = every bucket carries the effect; null = none does. Null is
    // the only safe answer when the base bake is unresolvable: guessing a font
    // would point the effect's atlas rects at the wrong texture.
    let effectFont: MSDFFont | null | undefined
    if (fontBound) {
      try {
        effectFont = family.get(baseKey)?.font ?? null
      } catch {
        // `synthesis: false` with a base key that has no bake
        effectFont = null
      }
      if (effectFont === null && !warnedUnanchoredEffect) {
        warnedUnanchoredEffect = true
        console.warn(
          `[lettra] rich-text was given a font-bound effect, but the base variant (weight ${baseKey.weight ?? 400} style ${baseKey.style ?? 'normal'}) is not loaded, so no bucket carries it. Await family.load for that variant, or pass the effect's font as the base \`variant\`.`
        )
      }
    }

    // bucket runs by bake identity so repeated spans share one draw — slant
    // included, since a synthetic oblique rides the upright bake and would
    // otherwise be merged into its upright run
    const buckets: Array<{ variant: LoadedVariant; glyphs: LayoutGlyph[] }> = []
    nextLayout.runs.forEach(({ run, glyphs }) => {
      // a run of pure whitespace places no quads; it gets no mesh
      if (glyphs.length === 0) return
      const variant = variants[run]
      let bucket = buckets.find((candidate) => sameBake(candidate.variant, variant))
      if (!bucket) {
        bucket = { variant, glyphs: [] }
        buckets.push(bucket)
      }
      bucket.glyphs.push(...glyphs)
    })

    const bounds = {
      inkOrigin: nextLayout.inkOrigin,
      width: nextLayout.width,
      height: nextLayout.height,
      baseline: nextLayout.metrics.baseline,
    }

    // paragraph-wide rank, so a stagger runs in text order and not bucket order
    const rank = new Map<number, number>()
    nextLayout.glyphs.forEach((glyph, ordinal) => rank.set(glyph.index, ordinal))
    const glyphIndexOf = (glyph: LayoutGlyph) => rank.get(glyph.index) ?? 0

    // build everything before touching the handle, so a throw leaves the
    // previous content standing instead of a half-replaced group
    const built: Mesh[] = []
    try {
      for (const bucket of buckets) {
        const { variant } = bucket
        bucket.glyphs.sort((a, b) => a.index - b.index)
        const bucketLayout: LayoutResult = {
          glyphs: bucket.glyphs,
          width: nextLayout.width,
          height: nextLayout.height,
          inkOrigin: nextLayout.inkOrigin,
          metrics: nextLayout.metrics,
        }
        const geometry = buildTextGeometry(bucketLayout, {
          ...geometryOptions,
          bounds,
          slant: variant.synthetic.slant,
          glyphIndexOf,
        })
        built.push(
          new Mesh(geometry, materialFor(variant.map, effectFont === undefined || variant.font === effectFont))
        )
      }
    } catch (error) {
      for (const mesh of built) mesh.geometry.dispose()
      throw error
    }

    clearMeshes()
    for (const mesh of built) group.add(mesh)
    meshes = built
    maps = buckets.map((bucket) => bucket.variant.map)
    text = nextText
    spans = nextSpans
    layoutOptions = nextLayoutOptions
    currentLayout = nextLayout
  }

  build(text, spans, layoutOptions)

  return {
    group,
    uniforms: { ...sharedUniforms, ...effect?.uniforms } as RichTextHandle<E>['uniforms'],
    get layout() {
      return currentLayout
    },
    setText(nextText, nextSpans, nextLayoutOptions) {
      // build commits text/spans only once it succeeds, so a throw can't leave
      // the handle holding spans that no longer match its text
      build(nextText, nextSpans ?? spans, nextLayoutOptions ?? layoutOptions)
      notify()
    },
    async warmup(renderer, camera, scene) {
      await warmup(renderer, group, camera, { scene, textures: [...new Set(maps)] })
      notify()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose({ maps: disposeMaps = false } = {}) {
      listeners.clear()
      const unique = new Set(maps)
      clearMeshes()
      for (const material of materials.values()) material.dispose()
      materials.clear()
      if (disposeMaps) unique.forEach((map) => map.dispose())
      maps = []
    },
  }
}
