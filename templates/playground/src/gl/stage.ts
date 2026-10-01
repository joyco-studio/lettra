import { PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu'
import type { Texture } from 'three/webgpu'
import type { Bounds, Metri, Viewport } from '@joycostudio/metri'
import type { MSDFFont } from 'letterpress'
import { loadFont, loadFontTexture } from 'letterpress/three'

export type FontName = 'bebas' | 'lora' | 'lettra'

export interface FontBundle {
  font: MSDFFont
  map: Texture
}

export interface StageView {
  scene: Scene
  camera: PerspectiveCamera
  /** Placeholder size changed (CSS px) — reframe the camera. */
  resize?(width: number, height: number): void
  /** Called once per frame while the view is on screen. Return true to keep
   * rendering next frame (time-driven effects like scramble). */
  update?(time: number): boolean | void
}

export interface ViewHandle {
  /** Request a render — call after mutating uniforms, geometry, rotation… */
  invalidate(): void
  dispose(): void
}

export interface Stage {
  renderer: WebGPURenderer
  fonts: Record<FontName, FontBundle>
  addView(el: HTMLElement, view: StageView): ViewHandle
  invalidate(): void
  dispose(): void
}

async function loadFontBundle(name: FontName): Promise<FontBundle> {
  const [font, map] = await Promise.all([loadFont(`/fonts/${name}.json`), loadFontTexture(`/fonts/${name}.png`)])
  return { font, map }
}

interface RegisteredView {
  el: HTMLElement
  view: StageView
  bounds: Bounds | undefined
  dispose(): void
}

/** One canvas for every example on the page, scroll-synced with the
 * "absolute" approach from the JOYCO WebGL Scroll Sync log: the canvas lives
 * in page space (moves with the compositor, so tracked content never drifts
 * from the DOM) and is slid back over the viewport each frame, oversized by
 * 25% top and bottom so the one-frame-stale transform never shows an edge.
 * Placeholder tracking comes from Metri — cached document-space bounds, one
 * shared ResizeObserver, no per-frame getBoundingClientRect. */
export async function createStage(canvas: HTMLCanvasElement, metri: Metri): Promise<Stage> {
  const [bebas, lora, lettra] = await Promise.all([
    loadFontBundle('bebas'),
    loadFontBundle('lora'),
    loadFontBundle('lettra'),
  ])
  const fonts = { bebas, lora, lettra }

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    forceWebGL: new URLSearchParams(location.search).has('forceWebGL'),
  })
  await renderer.init()
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  // atlas uploads off the hot path, before any view compiles against them
  for (const bundle of Object.values(fonts)) renderer.initTexture(bundle.map)

  /* canvas geometry: viewport width × 150% viewport height */
  let viewportW = 0
  let viewportH = 0
  let pad = 0
  let canvasH = 0
  let needsRender = true
  let lastScrollY = Number.NaN

  const invalidate = () => {
    needsRender = true
  }

  const applySize = () => {
    if (viewportW === 0 || viewportH === 0) return
    pad = Math.round(viewportH * 0.25)
    canvasH = viewportH + pad * 2
    canvas.style.width = `${viewportW}px`
    canvas.style.height = `${canvasH}px`
    renderer.setSize(viewportW, canvasH, false)
    lastScrollY = Number.NaN // force the transform + a render
  }

  const onViewportResize = (viewport: Viewport) => {
    if (viewport.width === viewportW && viewport.height === viewportH) return
    viewportW = viewport.width
    viewportH = viewport.height
    applySize()
  }
  metri.on('viewportResize', onViewportResize)
  // the event doesn't replay for late subscribers — seed from the cache
  if (metri.viewport) onViewportResize(metri.viewport)

  /* view registry */
  const views = new Set<RegisteredView>()

  const addView: Stage['addView'] = (el, view) => {
    const registered: RegisteredView = { el, view, bounds: undefined, dispose: () => {} }
    const tracking = metri.track(el, (bounds) => {
      const previous = registered.bounds
      registered.bounds = bounds
      if (!previous || previous.width !== bounds.width || previous.height !== bounds.height) {
        view.resize?.(bounds.width, bounds.height)
      }
      invalidate()
    })
    registered.dispose = () => {
      tracking.dispose()
      views.delete(registered)
      invalidate()
    }
    views.add(registered)
    return { invalidate, dispose: registered.dispose }
  }

  /* frame loop */
  renderer.setAnimationLoop((time: number) => {
    if (canvasH === 0) return
    const scrollY = metri.scroll.scrollY

    if (scrollY !== lastScrollY) {
      lastScrollY = scrollY
      // slide the page-space canvas back over the viewport (stale by ≤1
      // frame — the padding absorbs it)
      canvas.style.transform = `translate3d(0, ${scrollY - pad}px, 0)`
      needsRender = true
    }

    const visible: RegisteredView[] = []
    for (const registered of views) {
      const { bounds } = registered
      if (!bounds || bounds.width === 0 || bounds.height === 0) continue
      const viewportY = bounds.top - scrollY
      if (viewportY > viewportH + pad || viewportY + bounds.height < -pad) continue
      visible.push(registered)
      if (registered.view.update?.(time)) needsRender = true
    }

    if (!needsRender) return
    needsRender = false

    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissorTest(true)
    for (const { view, bounds } of visible) {
      const { left, top, width, height } = bounds!
      const y = top - scrollY + pad // canvas-local; the Renderer API is top-origin
      renderer.setViewport(left, y, width, height)
      renderer.setScissor(left, y, width, height)
      renderer.render(view.scene, view.camera)
    }
  })

  return {
    renderer,
    fonts,
    addView,
    invalidate,
    dispose() {
      renderer.setAnimationLoop(null)
      for (const registered of [...views]) registered.dispose()
      metri.off('viewportResize', onViewportResize)
      for (const bundle of Object.values(fonts)) bundle.map.dispose()
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

/** Token-cancelled rAF tween with cubic ease-out, invalidating per step. */
export function createTweener(invalidate: () => void) {
  let token = 0
  return {
    tween(duration: number, apply: (t: number) => void) {
      const current = ++token
      const start = performance.now()
      const step = (now: number) => {
        if (current !== token) return
        const t = Math.min(1, (now - start) / duration)
        apply(1 - Math.pow(1 - t, 3))
        invalidate()
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    cancel() {
      token++
    },
  }
}
