import { Group, PerspectiveCamera, Scene } from 'three/webgpu'
import type { LayoutOptions } from 'lettra'
import { createText } from 'lettra/three'
import type { FontName, Stage } from '../stage'
import { frameText, reframeOnResize } from '../stage'

export type Align = 'left' | 'center' | 'right'

export interface SpecimenState {
  text: string
  font: FontName
  align: Align
  letterSpacing: number
  /** 0 = baked value */
  lineHeight: number
  /** 0 = no wrap */
  maxWidth: number
}

export interface SpecimenView {
  apply(state: SpecimenState): void
  dispose(): void
}

function layoutOptions(state: SpecimenState): LayoutOptions {
  return {
    align: state.align,
    letterSpacing: state.letterSpacing,
    ...(state.lineHeight > 0 ? { lineHeight: state.lineHeight } : {}),
    ...(state.maxWidth > 0 ? { maxWidth: state.maxWidth } : {}),
    mode: state.maxWidth > 0 ? 'greedy' : 'pre',
  }
}

/** fig. 01 — the interactive specimen: live text, font swap, drag to tilt. */
export async function createSpecimenView(stage: Stage, el: HTMLElement, initial: SpecimenState): Promise<SpecimenView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10
  const rig = new Group()
  scene.add(rig)

  let current = initial
  const text = createText({
    font: stage.fonts[current.font].font,
    map: stage.fonts[current.font].map,
    text: current.text,
    layout: layoutOptions(current),
    material: { fill: '#414141' },
  })
  rig.add(text.mesh)

  const frame = () => {
    frameText(camera, {
      width: text.layout.width,
      height: text.layout.height,
      fontSize: text.layout.metrics.fontSize,
    })
  }

  const view = stage.dom.addView(el, { scene, camera, onFrame: reframeOnResize(camera, frame) })

  // pipeline compile off the hot path
  await text.warmup(stage.renderer, camera, scene)
  frame()

  /* drag to tilt */
  let dragging = false
  let lastX = 0
  let lastY = 0
  const onPointerDown = (event: PointerEvent) => {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    el.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return
    rig.rotation.y += (event.clientX - lastX) * 0.005
    rig.rotation.x = Math.max(-1.2, Math.min(1.2, rig.rotation.x + (event.clientY - lastY) * 0.005))
    lastX = event.clientX
    lastY = event.clientY
  }
  const onPointerUp = () => {
    dragging = false
  }
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)

  return {
    apply(next) {
      const fontChanged = next.font !== current.font
      current = next
      if (fontChanged) {
        // atomic: geometry + atlas rebind happen in one tick inside swapFont
        text.swapFont({
          font: stage.fonts[next.font].font,
          map: stage.fonts[next.font].map,
          text: next.text,
          layout: layoutOptions(next),
        })
      } else {
        text.setText(next.text, layoutOptions(next))
      }
      frame()
    },
    dispose() {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      view.destroy()
      text.dispose({ map: false })
    },
  }
}
