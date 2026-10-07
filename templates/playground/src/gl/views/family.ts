import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createRichText, createText, defineFamily } from 'lettra/three'
import type { FontFamily, LoadedVariant, TextHandle } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText } from '../stage'

export interface FamilyState {
  weight: number
  style: 'normal' | 'italic'
}

/** Resolution readout for the DOM overlay. */
export interface FamilyInfo {
  served: string
  mode: 'exact' | 'fallback'
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

  // unwound in reverse on a failed build: the stage view is registered before
  // the last awaits, so a rejected load or warmup would otherwise leave it
  // rendering, unreachable and undisposable
  const created: Array<() => void> = [() => inter.dispose()]
  const teardown = () => {
    for (const dispose of [...created].reverse()) dispose()
  }

  let token = 0
  let disposed = false
  let current = initial

  try {
    // the demo exercises every variant; a page would family.load() what it uses.
    // Promise.all short-circuits, so one 404 leaves the atlases that did land
    // for inter.dispose() to free
    await inter.loadAll()
    inter.warmup(stage.renderer)

    const initialVariant = await inter.load({ weight: current.weight, style: current.style })

    const text: TextHandle = createText({
      variant: initialVariant,
      text: TEXT,
      layout: { align: 'center' },
      material: { fill: '#414141' },
    })
    created.push(() => text.dispose()) // family-owned atlas: skipped automatically
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
    created.push(() => rich.dispose())
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
    created.push(() => handle.dispose())
    text.onChange(() => handle.invalidate())
    rich.onChange(() => handle.invalidate())

    await text.warmup(stage.renderer, camera, scene)
    await rich.warmup(stage.renderer, camera, scene)
    frame()

    const describe = (state: FamilyState, variant: LoadedVariant): FamilyInfo => {
      const servedStyle = variant.style === 'italic' ? ' italic' : ''
      const exact = variant.weight === state.weight && variant.style === state.style
      const details =
        variant.synthetic.slant !== 0
          ? 'synthetic oblique 14°'
          : exact
            ? 'exact variant hit'
            : 'closest bake, served as-is'
      return {
        served: `bake ${variant.weight}${servedStyle}`,
        mode: exact ? 'exact' : 'fallback',
        details,
      }
    }

    return {
      async apply(next) {
        const mine = ++token
        current = next
        let variant: LoadedVariant
        try {
          variant = await inter.load({ weight: next.weight, style: next.style })
        } catch (error) {
          // dispose() mid-load rejects it by design; anything else is real
          if (mine !== token || disposed) return null
          throw error
        }
        // a newer apply, or dispose(), superseded this one
        if (mine !== token || disposed) return null
        text.setVariant(variant)
        frame()
        return describe(next, variant)
      },
      dispose() {
        if (disposed) return
        disposed = true
        // bump the token too, so an apply already past its await bails instead
        // of rebuilding geometry on a disposed text — or, because a family is
        // reusable after dispose, restarting its loads and leaking fresh atlases
        token++
        teardown()
      },
    }
  } catch (error) {
    teardown()
    throw error
  }
}
