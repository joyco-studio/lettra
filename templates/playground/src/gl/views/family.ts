import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createText } from 'lettra/three'
import type { LoadedVariant, TextHandle } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText, reframeOnResize } from '../stage'

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

/** fig. 02: a family resolving weight and style. Spans get their own figure
 * (`rich-text.ts`), on this same stage-owned family. */
export async function createFamilyView(stage: Stage, el: HTMLElement, initial: FamilyState): Promise<FamilyView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  const inter = stage.inter

  // unwound in reverse on a failed build: the stage view is registered before
  // the last awaits, so a rejected load or warmup would otherwise leave it
  // rendering, unreachable and undisposable. The family is not in here: the
  // stage owns it, and the rich-text figure is drawing from it too
  const created: Array<() => void> = []
  const teardown = () => {
    for (const dispose of [...created].reverse()) dispose()
  }

  let token = 0
  let disposed = false
  let current = initial

  try {
    // the demo exercises every variant; a page would family.load() what it uses.
    // Promise.all short-circuits, so one 404 leaves the atlases that did land
    // for the stage's inter.dispose() to free
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

    const frame = () => {
      frameText(camera, {
        width: text.layout.width,
        height: text.layout.height,
        fontSize: text.layout.metrics.fontSize,
      })
    }

    const view = stage.dom.addView(el, { scene, camera, onFrame: reframeOnResize(camera, frame) })
    created.push(() => view.destroy())

    await text.warmup(stage.renderer, camera, scene)
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
        // of rebuilding geometry on a disposed text
        token++
        teardown()
      },
    }
  } catch (error) {
    teardown()
    throw error
  }
}
