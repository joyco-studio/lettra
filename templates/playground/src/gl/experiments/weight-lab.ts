import { Group, OrthographicCamera, Scene, WebGPURenderer } from 'three/webgpu'
import { createText, defineFamily } from 'lettra/three'
import type { TextHandle } from 'lettra/three'

/* Side-by-side rig for the weight-interpolation experiment: every stop is
 * rendered twice, once from its own baked instance and once from the single
 * delta atlas at the matching t, so the two can be overlaid and compared. */

export const STOPS = [300, 425, 550, 675, 800] as const

export type LabMode = 'overlay' | 'split'

export interface WeightLab {
  /** Continuous row only; the stop rows stay pinned to their weights. */
  setT(t: number): void
  setMode(mode: LabMode): void
  setText(text: string): void
  dispose(): void
}

const TRUE_INK = '#1b1b1b'
const DELTA_INK = '#d4482a'
const ROW_GAP = 1.15
const SPLIT_OFFSET = 0.42

export async function createWeightLab(canvas: HTMLCanvasElement, initialText: string): Promise<WeightLab> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    forceWebGL: new URLSearchParams(location.search).has('forceWebGL'),
  })
  await renderer.init()
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  camera.position.z = 10
  const rig = new Group()
  scene.add(rig)

  const baked = defineFamily({
    src: STOPS.map((weight) => ({
      json: `/fonts/exp/inter-${weight}.json`,
      atlas: `/fonts/exp/inter-${weight}.png`,
      weight,
    })),
  })
  const variable = defineFamily({
    src: [{ json: '/fonts/exp/inter-vf.json', atlas: '/fonts/exp/inter-vf.png', weightRange: [300, 800] }],
  })
  await Promise.all([baked.loadAll(), variable.loadAll()])
  baked.warmup(renderer)
  variable.warmup(renderer)

  interface Row {
    truth: TextHandle
    delta: TextHandle
    y: number
  }

  const rows: Row[] = []
  for (const [i, weight] of STOPS.entries()) {
    const y = (STOPS.length - 1 - i) * ROW_GAP
    const truth = createText({
      variant: await baked.load({ weight }),
      text: initialText,
      layout: { align: 'center' },
      material: { fill: TRUE_INK },
    })
    const delta = createText({
      variant: await variable.load({ weight }),
      text: initialText,
      layout: { align: 'center' },
      material: { fill: DELTA_INK, opacity: 0.65 },
    })
    truth.mesh.position.y = y
    delta.mesh.position.y = y
    delta.mesh.renderOrder = 1
    rig.add(truth.mesh, delta.mesh)
    rows.push({ truth, delta, y })
  }

  // free row: the delta atlas swept continuously, with no baked counterpart
  const sweepY = -ROW_GAP * 1.4
  const sweep = createText({
    variant: await variable.load({ weight: 550 }),
    text: initialText,
    layout: { align: 'center' },
    material: { fill: TRUE_INK },
  })
  sweep.mesh.position.y = sweepY
  rig.add(sweep.mesh)

  const frame = () => {
    const width = canvas.clientWidth || 1
    const height = canvas.clientHeight || 1
    renderer.setSize(width, height, false)

    const widest = Math.max(...rows.map((row) => row.truth.layout.width / row.truth.layout.metrics.fontSize))
    const worldHeight = (STOPS.length - 1) * ROW_GAP + Math.abs(sweepY) + 2
    const worldWidth = Math.max(widest * 1.15, (worldHeight * width) / height)
    const halfW = Math.max(worldWidth, (worldHeight * width) / height) / 2
    const halfH = halfW / (width / height)

    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.position.y = ((STOPS.length - 1) * ROW_GAP + sweepY) / 2
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }

  for (const row of rows) {
    row.truth.onChange(frame)
    row.delta.onChange(frame)
  }
  sweep.onChange(frame)

  await Promise.all([
    ...rows.flatMap((row) => [row.truth.warmup(renderer, camera, scene), row.delta.warmup(renderer, camera, scene)]),
    sweep.warmup(renderer, camera, scene),
  ])

  const observer = new ResizeObserver(frame)
  observer.observe(canvas)
  frame()

  return {
    setT(t) {
      sweep.experimental_setWeightT(t)
      frame()
    },
    setMode(mode) {
      for (const row of rows) {
        row.delta.mesh.position.y = mode === 'overlay' ? row.y : row.y - SPLIT_OFFSET
        row.delta.uniforms.opacity.value = mode === 'overlay' ? 0.65 : 1
      }
      frame()
    },
    setText(next) {
      for (const row of rows) {
        row.truth.setText(next)
        row.delta.setText(next)
      }
      sweep.setText(next)
      frame()
    },
    dispose() {
      observer.disconnect()
      for (const row of rows) {
        row.truth.dispose()
        row.delta.dispose()
      }
      sweep.dispose()
      baked.dispose()
      variable.dispose()
      renderer.dispose()
    },
  }
}
