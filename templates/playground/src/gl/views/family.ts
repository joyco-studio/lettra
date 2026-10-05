import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createText, defineFamily, experimental_createRichText, weightToT } from 'lettra/three'
import type { FontFamily, TextHandle } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText } from '../stage'

export interface FamilyState {
  weight: number
  style: 'normal' | 'italic'
  /** true → the single delta-channel atlas; false → the static bakes. */
  vf: boolean
}

/** Resolution readout for the DOM overlay. */
export interface FamilyInfo {
  served: string
  mode: 'baked' | 'synthetic' | 'interpolated'
  details: string
}

export interface FamilyView {
  apply(state: FamilyState): Promise<FamilyInfo | null>
  /** vf only: slides the weight uniform without re-layout (per-frame safe). */
  setLiveWeight(weight: number): void
  dispose(): void
}

const TEXT = 'Sphinx of black quartz,\njudge my vow'

/** fig. 02: one family, every weight, baked variants with synthetic
 * corrections between them, or one delta-channel atlas interpolating
 * continuously on the GPU. A rich-text line mixes variants in one layout. */
export async function createFamilyView(stage: Stage, el: HTMLElement, initial: FamilyState): Promise<FamilyView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  const inter: FontFamily = defineFamily({
    src: [
      { json: '/fonts/inter-200.json', atlas: '/fonts/inter-200.png', weight: 200 },
      { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
      { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
      { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
      { json: '/fonts/inter-700i.json', atlas: '/fonts/inter-700i.png', weight: 700, style: 'italic' },
    ],
  })
  const interVf: FontFamily = defineFamily({
    src: [{ json: '/fonts/inter-vf.json', atlas: '/fonts/inter-vf.png', weightRange: [300, 800] }],
  })

  // the demo exercises every variant, so loadAll is the point here; a page
  // using two of them would family.load() those two instead
  await Promise.all([inter.loadAll(), interVf.loadAll()])
  inter.warmup(stage.renderer)
  interVf.warmup(stage.renderer)

  let current = initial
  const initialVariant = current.vf
    ? await interVf.load({ weight: current.weight })
    : await inter.load({ weight: current.weight, style: current.style })

  const text: TextHandle = createText({
    variant: initialVariant,
    text: TEXT,
    layout: { align: 'center' },
    material: { fill: '#414141' },
  })
  scene.add(text.mesh)

  // one paragraph, three variants; spans resolve through the same family
  const rich = experimental_createRichText({
    family: inter,
    text: 'one layout, regular to bold to italic',
    spans: [
      { start: 23, end: 27, weight: 700 },
      { start: 31, end: 37, style: 'italic' },
    ],
    layout: { align: 'center' },
    material: { fill: '#8a8a86' },
  })
  scene.add(rich.group)

  const frame = () => {
    frameText(camera, {
      width: text.layout.width,
      height: text.layout.height,
      fontSize: text.layout.metrics.fontSize,
    })
    // park the rich line under the main block, in em units
    const mainHalf = text.layout.height / text.layout.metrics.fontSize / 2
    rich.group.position.y = -(mainHalf + 1.1)
    rich.group.scale.setScalar(0.42)
    handle.invalidate()
  }

  const handle = stage.addView(el, {
    scene,
    camera,
    resize(width, height) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      frame()
    },
  })
  text.onChange(() => handle.invalidate())
  rich.onChange(() => handle.invalidate())

  await text.warmup(stage.renderer, camera, scene)
  await rich.warmup(stage.renderer, camera, scene)
  frame()

  let token = 0

  const describe = (state: FamilyState, variant: Awaited<ReturnType<FontFamily['load']>>): FamilyInfo => {
    if (state.vf) {
      return {
        served: `one atlas, wght ${variant.weight}`,
        mode: 'interpolated',
        details: `t = ${(variant.weightT ?? 0).toFixed(2)} · advances from deltas, strokes from the alpha field`,
      }
    }
    const servedStyle = variant.style === 'italic' ? ' italic' : ''
    const corrections: string[] = []
    if (variant.synthetic.boldness !== 0)
      corrections.push(
        `boldness ${variant.synthetic.boldness > 0 ? '+' : ''}${variant.synthetic.boldness.toFixed(4)}em`
      )
    if (variant.synthetic.slant !== 0) corrections.push('synthetic oblique 14°')
    const details =
      corrections.length > 0
        ? corrections.join(' · ')
        : variant.weight === state.weight
          ? 'exact variant hit'
          : 'nearest bake as-is · thinning is never synthesized'
    return {
      served: `bake ${variant.weight}${servedStyle}`,
      mode: corrections.length > 0 ? 'synthetic' : 'baked',
      details,
    }
  }

  return {
    async apply(next) {
      const mine = ++token
      current = next
      const variant = next.vf
        ? await interVf.load({ weight: next.weight })
        : await inter.load({ weight: next.weight, style: next.style })
      if (mine !== token) return null // a newer apply superseded this one
      text.setVariant(variant)
      frame()
      return describe(next, variant)
    },
    setLiveWeight(weight) {
      if (!current.vf) return
      const vf = interVf.get({ weight })
      if (!vf) return
      text.experimental_setWeightT(weightToT(vf.font, weight))
      handle.invalidate()
    },
    dispose() {
      handle.dispose()
      text.dispose() // family-owned atlas: skipped automatically
      rich.dispose()
      inter.dispose()
      interVf.dispose()
    },
  }
}
