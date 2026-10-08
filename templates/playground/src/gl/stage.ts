import { WebGPURenderer } from 'three/webgpu'
import type { PerspectiveCamera, Texture } from 'three/webgpu'
import { ThreeDOM } from 'portalgl/three'
import type { MSDFFont } from 'lettra'
import { defineFamily, loadFont, loadFontTexture } from 'lettra/three'
import type { FontFamily } from 'lettra/three'

export type FontName = 'bebas' | 'lora' | 'respira' | 'roboto' | 'lettra'

export interface FontBundle {
  font: MSDFFont
  map: Texture
}

export interface Stage {
  renderer: WebGPURenderer
  /** Every figure is a `dom.addView(el, { scene, camera, onFrame })`. */
  dom: ThreeDOM
  fonts: Record<FontName, FontBundle>
  /** Declared here and shared by every figure that wants a variant, so the
   * five Inter bakes are one set of atlases however many figures use them.
   * Lazy: nothing loads until a view awaits `load`/`loadAll`, and concurrent
   * awaits of one bake share its request. Stage-owned — views never dispose
   * it. */
  inter: FontFamily
  dispose(): void
}

/** Baked by `npx lettra bake Inter.ttf --weights 200,400,700 --italic …`. */
const INTER_SRC = [
  { json: '/fonts/inter-200.json', atlas: '/fonts/inter-200.png', weight: 200 },
  { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
  { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
  { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' as const },
  { json: '/fonts/inter-700i.json', atlas: '/fonts/inter-700i.png', weight: 700, style: 'italic' as const },
]

async function loadFontBundle(name: FontName): Promise<FontBundle> {
  const [font, map] = await Promise.all([loadFont(`/fonts/${name}.json`), loadFontTexture(`/fonts/${name}.png`)])
  return { font, map }
}

/** One renderer for every example on the page. PortalGL does the DOM sync:
 * each placeholder is a view that tracks its element, sizes its camera and
 * skips drawing while offscreen. Native WebGPU gets a canvas per view, the
 * WebGL2 fallback one shared canvas pinned to `container`, which must start
 * at the document origin. */
export async function createStage(container: HTMLElement): Promise<Stage> {
  const [bebas, lora, respira, roboto, lettra] = await Promise.all([
    loadFontBundle('bebas'),
    loadFontBundle('lora'),
    loadFontBundle('respira'),
    loadFontBundle('roboto'),
    loadFontBundle('lettra'),
  ])
  const fonts = { bebas, lora, respira, roboto, lettra }
  const inter = defineFamily({ src: INTER_SRC })

  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: true,
    forceWebGL: new URLSearchParams(location.search).has('forceWebGL'),
  })
  await renderer.init()
  renderer.setClearColor(0x000000, 0)

  // atlas uploads off the hot path, before any view compiles against them
  for (const bundle of Object.values(fonts)) renderer.initTexture(bundle.map)

  const dom = new ThreeDOM({ renderer, container })
  renderer.setAnimationLoop((time: number) => dom.update(time))

  return {
    renderer,
    dom,
    fonts,
    inter,
    dispose() {
      renderer.setAnimationLoop(null)
      dom.destroy()
      for (const bundle of Object.values(fonts)) bundle.map.dispose()
      inter.dispose()
      renderer.dispose()
    },
  }
}

/** Camera distance that frames a text handle's ink box with a little margin
 * — shared by every example view. */
export function frameText(camera: PerspectiveCamera, layout: { width: number; height: number; fontSize: number }) {
  const scale = 1 / layout.fontSize
  const halfW = (layout.width * scale) / 2
  const halfH = (layout.height * scale) / 2
  const tanH = Math.tan((camera.fov * Math.PI) / 360)
  const distance = Math.max(halfH / tanH, halfW / (tanH * camera.aspect))
  camera.position.z = Math.min(60, Math.max(3, distance * 1.25))
}

/** ThreeDOM owns the camera aspect; returns an `onFrame` that reframes
 * whenever the host's aspect changed since the last frame. */
export function reframeOnResize(camera: PerspectiveCamera, frame: () => void) {
  let aspect = Number.NaN
  return () => {
    if (camera.aspect === aspect) return
    aspect = camera.aspect
    frame()
  }
}

/** Token-cancelled rAF tween with cubic ease-out. */
export function createTweener() {
  let token = 0
  return {
    tween(duration: number, apply: (t: number) => void) {
      const current = ++token
      const start = performance.now()
      const step = (now: number) => {
        if (current !== token) return
        const t = Math.min(1, (now - start) / duration)
        apply(1 - Math.pow(1 - t, 3))
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    cancel() {
      token++
    },
  }
}
