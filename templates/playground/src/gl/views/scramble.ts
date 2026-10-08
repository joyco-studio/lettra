import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createText, scramble } from 'lettra/three'
import type { Stage } from '../stage'
import { createTweener, frameText, reframeOnResize } from '../stage'

export interface ScrambleView {
  /** Scramble everything, then decode back to clean glyphs. */
  decode(): void
  setAmount(value: number): void
  dispose(): void
}

const TEXT = 'DECODING\nTHE ATLAS'
const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** fig. 05 — the glyph scramble: glyphs re-roll through the atlas while
 * driven, engaging in stable random order. */
export async function createScrambleView(stage: Stage, el: HTMLElement): Promise<ScrambleView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  const effect = scramble({ font: stage.fonts.roboto.font, chars: POOL, rate: 14 })
  const text = createText({
    font: stage.fonts.roboto.font,
    map: stage.fonts.roboto.map,
    text: TEXT,
    layout: { align: 'center' },
    material: { fill: '#414141', effect },
  })
  scene.add(text.mesh)

  const frame = () => {
    frameText(camera, {
      width: text.layout.width,
      height: text.layout.height,
      fontSize: text.layout.metrics.fontSize,
    })
  }

  const view = stage.dom.addView(el, { scene, camera, onFrame: reframeOnResize(camera, frame) })
  const tweener = createTweener()

  await text.warmup(stage.renderer, camera, scene)
  frame()

  return {
    decode() {
      text.uniforms.scramble.value = 1
      tweener.tween(2200, (t) => {
        text.uniforms.scramble.value = 1 - t
      })
    },
    setAmount(value) {
      tweener.cancel()
      text.uniforms.scramble.value = value
    },
    dispose() {
      tweener.cancel()
      view.destroy()
      text.dispose({ map: false })
    },
  }
}
