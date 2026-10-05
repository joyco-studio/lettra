/* One paragraph, several family variants (italic or weight spans). One mesh per variant
 * bucket under a Group; wrapping and the wipe span stay paragraph-wide. */

import { Group, Mesh } from 'three/webgpu'
import type { Camera, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import { uniform } from 'three/tsl'
import { layoutRuns } from '../core/runs'
import type { RunsLayoutResult } from '../core/runs'
import { syntheticThresholdShift } from '../core/family'
import type { VariantKey } from '../core/family'
import type { LayoutGlyph, LayoutOptions, LayoutResult, MSDFFont } from '../core/types'
import type { FontFamily, LoadedVariant } from './family'
import { buildTextGeometry } from './geometry'
import type { TextGeometryOptions } from './geometry'
import { createTextMaterial, createTextUniforms } from './material'
import type { EffectUniforms, TextEffect, TextMaterialOptions, TextUniforms } from './material'
import { warmup } from './lifecycle'

export interface RichSpan extends VariantKey {
  /** [start, end). Must not overlap; gaps use the base `variant` key. */
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
  geometry?: Omit<TextGeometryOptions, 'bounds' | 'glyphIndexOffset' | 'slant'>
  /** Shared across bucket materials. Font-bound effects (scramble) only
   * match the base variant. */
  material?: Omit<TextMaterialOptions<E>, 'map' | 'uniforms' | 'experimental'>
}

export interface RichTextHandle<E extends TextEffect | undefined = undefined> {
  /** One child mesh per variant bucket. */
  group: Group
  /** Shared across buckets. No `boldness`: each bucket owns its own synthetic
   * correction. */
  uniforms: Omit<TextUniforms, 'boldness'> & EffectUniforms<E>
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

/** Sorts spans and fills gaps with the base key so runs tile the text. */
function normalizeRuns(
  length: number,
  spans: RichSpan[],
  base: VariantKey
): Array<VariantKey & { start: number; end: number }> {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const runs: Array<VariantKey & { start: number; end: number }> = []
  let cursor = 0
  for (const span of sorted) {
    if (span.start < cursor) fail('rich-text spans must not overlap')
    if (span.end > length) fail('rich-text span exceeds the text length')
    if (span.start > cursor) runs.push({ ...base, start: cursor, end: span.start })
    runs.push({ ...span })
    cursor = span.end
  }
  if (cursor < length) runs.push({ ...base, start: cursor, end: length })
  return runs
}

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

  const group = new Group()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())

  let currentLayout!: RunsLayoutResult
  let maps: Texture[] = []

  const clearMeshes = () => {
    for (const child of [...group.children]) {
      const mesh = child as Mesh
      mesh.geometry.dispose()
      const material = mesh.material
      if (!Array.isArray(material)) material.dispose()
      group.remove(mesh)
    }
  }

  const build = () => {
    const runKeys = normalizeRuns(text.length, spans, baseKey)
    const variants = runKeys.map((key) => {
      const variant = family.get(key)
      if (!variant) {
        fail(
          `variant weight ${key.weight ?? 400} style ${key.style ?? 'normal'} is not loaded; await family.load or loadAll first`
        )
      }
      return variant
    })

    currentLayout = layoutRuns(
      text,
      runKeys.map((key, i) => ({ font: variants[i].font, start: key.start, end: key.end })),
      layoutOptions
    )

    // bucket runs by (font, map) identity so repeated spans share one draw
    const buckets = new Map<MSDFFont, Map<Texture, { variant: LoadedVariant; glyphs: LayoutGlyph[] }>>()
    currentLayout.runs.forEach(({ run, glyphs }) => {
      const variant = variants[run]
      let byMap = buckets.get(variant.font)
      if (!byMap) {
        byMap = new Map()
        buckets.set(variant.font, byMap)
      }
      const bucket = byMap.get(variant.map) ?? { variant, glyphs: [] }
      bucket.glyphs.push(...glyphs)
      byMap.set(variant.map, bucket)
    })

    const bounds = {
      inkOrigin: currentLayout.inkOrigin,
      width: currentLayout.width,
      height: currentLayout.height,
      baseline: currentLayout.metrics.baseline,
    }

    clearMeshes()
    maps = []
    // keep glyphIndex paragraph-global so stagger effects don't restart per bucket
    let glyphIndexOffset = 0
    for (const byMap of buckets.values()) {
      for (const bucket of byMap.values()) {
        const { variant } = bucket
        bucket.glyphs.sort((a, b) => a.index - b.index)
        const bucketLayout: LayoutResult = {
          glyphs: bucket.glyphs,
          width: currentLayout.width,
          height: currentLayout.height,
          inkOrigin: currentLayout.inkOrigin,
          metrics: currentLayout.metrics,
        }
        const geometry = buildTextGeometry(bucketLayout, {
          ...geometryOptions,
          bounds,
          slant: variant.synthetic.slant,
          glyphIndexOffset,
        })
        glyphIndexOffset += bucket.glyphs.length
        // share fill/opacity; boldness is the bucket's synthetic correction
        const { material } = createTextMaterial({
          map: variant.map,
          effect,
          uniforms: {
            ...sharedUniforms,
            boldness: uniform(syntheticThresholdShift(variant.synthetic.boldness, variant.font)),
          },
        })
        group.add(new Mesh(geometry, material))
        maps.push(variant.map)
      }
    }
  }

  build()

  // boldness is per-bucket (each variant's own correction), so it stays off
  // the shared bag rather than pretending to be tweenable
  const shared = { fill: sharedUniforms.fill, opacity: sharedUniforms.opacity }

  return {
    group,
    uniforms: { ...shared, ...effect?.uniforms } as RichTextHandle<E>['uniforms'],
    get layout() {
      return currentLayout
    },
    setText(nextText, nextSpans, nextLayoutOptions) {
      text = nextText
      if (nextSpans) spans = nextSpans
      if (nextLayoutOptions) layoutOptions = nextLayoutOptions
      build()
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
      if (disposeMaps) unique.forEach((map) => map.dispose())
      maps = []
    },
  }
}
