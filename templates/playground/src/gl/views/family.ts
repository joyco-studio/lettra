import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createRichText, createText, defineFamily } from 'lettra/three'
import type { FontFamily, TextHandle } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText } from '../stage'

export interface FamilyState {
  weight: number
  style: 'normal' | 'italic'
}

/** Resolution readout for the DOM overlay. */
export interface FamilyInfo {
  served: string
  mode: 'baked' | 'synthetic'
  details: string
}

export interface FamilyView {
  apply(state: FamilyState): Promise<FamilyInfo | null>
  dispose(): void
}

const TEXT = 'Sphinx of black quartz,\njudge my vow'

/** fig. 02: a family resolving weight and style, with a rich-text line below
 * mixing three variants in one layout. */
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

  // the demo exercises every variant; a page would family.load() what it uses
  await inter.loadAll()
  inter.warmup(stage.renderer)

  let current = initial
  const initialVariant = await inter.load({ weight: current.weight, style: current.style })

  const text: TextHandle = createText({
    variant: initialVariant,
    text: TEXT,
    layout: { align: 'center' },
    material: { fill: '#414141' },
  })
  scene.add(text.mesh)

  // one paragraph, three variants; spans resolve through the same family
  const rich = createRichText({
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
      const variant = await inter.load({ weight: next.weight, style: next.style })
      if (mine !== token) return null // a newer apply superseded this one
      text.setVariant(variant)
      frame()
      return describe(next, variant)
    },
    dispose() {
      handle.dispose()
      text.dispose() // family-owned atlas: skipped automatically
      rich.dispose()
      inter.dispose()
    },
  }
}
