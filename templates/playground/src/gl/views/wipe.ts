import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createText, wipe } from 'lettra/three'
import type { Stage } from '../stage'
import { createTweener, frameText } from '../stage'

export interface WipeView {
  wipe(direction: 'in' | 'out'): void
  replay(): void
  dispose(): void
}

const TEXT = 'EDGES FIRST,\nBONES LAST.'

/** fig. 04 — the erosion wipe: glyphs dissolve through the distance field. */
export async function createWipeView(stage: Stage, el: HTMLElement): Promise<WipeView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  const text = createText({
    font: stage.fonts.bebas.font,
    map: stage.fonts.bebas.map,
    text: TEXT,
    layout: { align: 'center' },
    material: { fill: '#414141', effect: wipe({ band: 0.35 }) },
  })
  text.uniforms.wipeIn.value = 0 // hidden until the view scrolls in
  scene.add(text.mesh)

  const frame = () => {
    frameText(camera, {
      width: text.layout.width,
      height: text.layout.height,
      fontSize: text.layout.metrics.fontSize,
    })
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
  const tweener = createTweener(() => handle.invalidate())

  await text.warmup(stage.renderer, camera, scene)
  frame()

  const run = (direction: 'in' | 'out') => {
    if (direction === 'in') {
      text.uniforms.wipeIn.value = 0
      text.uniforms.wipeOut.value = 0
      tweener.tween(1400, (t) => {
        text.uniforms.wipeIn.value = t
      })
    } else {
      text.uniforms.wipeIn.value = 1
      text.uniforms.wipeOut.value = 0
      tweener.tween(1400, (t) => {
        text.uniforms.wipeOut.value = t
      })
    }
  }

  return {
    wipe: run,
    replay() {
      run('in')
    },
    dispose() {
      tweener.cancel()
      handle.dispose()
      text.dispose({ map: false })
    },
  }
}
