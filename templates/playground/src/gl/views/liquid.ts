import {
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  QuadMesh,
  RenderTarget,
  Scene,
  Vector2,
  Vector3,
} from 'three/webgpu'
import {
  color,
  float,
  max,
  mix,
  positionWorld,
  saturate,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl'
import { composeEffects, createText, scramble } from 'lettra/three'
import type { TextEffect } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText } from '../stage'

export interface LiquidView {
  dispose(): void
}

/* fig. 06 — the composition seam, end to end. A small GPU fluid sim (one
 * half-float ping-pong texture: rg = velocity, b = ink) is splatted along
 * the cursor stroke, advected semi-Lagrangian style, and dissipated every
 * frame — ink swirls with your motion and soaks away on its own. That dye
 * texture is one scalar field used three ways: a translucent plane draws
 * the water, its rim drives the scramble (glyphs re-roll where the edge
 * touches them), and its interior tints the ink wet. The library
 * contributes only `scramble({ drive })` — the sim is view code, and any
 * other field plugs into the same seam. */

const SIM_W = 384
const SIM_H = 192
const INK_DISSIPATE = 0.975 // per 60 Hz step — gone in ~1.5 s
const VEL_DAMP = 0.94
const SETTLE_MS = 3200

const PARAGRAPH =
  'Drag the cursor through this text. Ink splats into a tiny fluid sim, ' +
  'swirls with your motion, and soaks away. Every glyph the rim touches ' +
  're-rolls through the atlas.'

export async function createLiquidView(stage: Stage, el: HTMLElement): Promise<LiquidView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  /* ── the sim ───────────────────────────────────────────────────────── */
  const targets = [0, 1].map(() => {
    const target = new RenderTarget(SIM_W, SIM_H, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
    })
    target.texture.generateMipmaps = false
    return target
  })
  let read = targets[0]
  let write = targets[1]

  const dtU = uniform(1 / 60)
  const aspectU = uniform(2)
  /** Stroke segment endpoints in aspect-corrected sim uv. */
  const splatA = uniform(new Vector2(-10, -10))
  const splatB = uniform(new Vector2(-10, -10))
  const splatVelU = uniform(new Vector2(0, 0))
  const splatRadiusU = uniform(0.09)
  const inkStrengthU = uniform(0)

  // semi-Lagrangian step: sample state, backtrace by its own velocity,
  // damp + dissipate, then splat the cursor stroke in as a capsule
  const here = texture(read.texture, uv())
  const back = texture(read.texture, uv().sub(here.rg.mul(dtU)))
  const p = uv().mul(vec2(aspectU, 1))
  const pa = p.sub(splatA)
  const ba = splatB.sub(splatA)
  const h = saturate(pa.dot(ba).div(ba.dot(ba).add(1e-6)))
  const gauss = pa.sub(ba.mul(h)).length().div(splatRadiusU).pow(2).negate().exp()
  const velocity = back.rg.mul(VEL_DAMP).add(splatVelU.mul(gauss))
  const ink = back.b.mul(INK_DISSIPATE).add(gauss.mul(inkStrengthU)).min(1.3)

  const simMaterial = new MeshBasicNodeMaterial()
  simMaterial.fragmentNode = vec4(velocity, ink, 1)
  const quad = new QuadMesh(simMaterial)

  /* ── world ↔ sim mapping (visible rect at z = 0) ───────────────────── */
  const worldMinU = uniform(new Vector2(-1, -1))
  const worldSizeInvU = uniform(new Vector2(0.5, 0.5))
  const simUv = positionWorld.xy.sub(worldMinU).mul(worldSizeInvU)

  /* the field, read back out of the dye — rim scrambles, interior wets */
  const fieldTex = texture(read.texture, simUv)
  const field = fieldTex.b
  const rim = saturate(float(1).sub(field.sub(0.4).abs().div(0.25)))
  const wet = smoothstep(0.4, 0.8, field)

  const { font, map } = stage.fonts.lettra
  // the paragraph minifies the bake ~2x on 1x displays; mips kill the crunch (lettra only lives here)
  map.generateMipmaps = true
  map.minFilter = LinearMipmapLinearFilter
  map.needsUpdate = true
  // interior wetness tints the ink through the color wire — same contract
  // as the scramble, so both compose instead of overwriting colorNode
  const wetInk: TextEffect = {
    uniforms: {},
    stages: { color: (prev) => mix(prev, color('#1d3557'), wet) },
  }
  const text = createText({
    font,
    map,
    text: PARAGRAPH,
    layout: { align: 'left', maxWidth: 1400, mode: 'greedy' },
    material: {
      fill: '#414141',
      effect: composeEffects(scramble({ font, rate: 22, drive: (knob) => max(knob, rim) }), wetInk),
    },
  })
  text.mesh.renderOrder = 1
  scene.add(text.mesh)

  /* the water itself: a wash for the ink body, a darker line on the rim */
  const waterMaterial = new MeshBasicNodeMaterial()
  waterMaterial.colorNode = mix(color('#86a4bf'), color('#3c5e82'), rim)
  waterMaterial.opacityNode = smoothstep(0.08, 0.6, field).mul(0.34).add(rim.mul(0.26))
  waterMaterial.transparent = true
  waterMaterial.depthWrite = false
  const water = new Mesh(new PlaneGeometry(1, 1), waterMaterial)
  water.position.z = -0.1
  water.renderOrder = 0
  scene.add(water)

  const frame = () => {
    frameText(camera, {
      width: text.layout.width,
      height: text.layout.height,
      fontSize: text.layout.metrics.fontSize,
    })
    const visibleH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
    const visibleW = visibleH * camera.aspect
    water.scale.set(visibleW, visibleH, 1)
    worldMinU.value.set(-visibleW / 2, -visibleH / 2)
    worldSizeInvU.value.set(1 / visibleW, 1 / visibleH)
    aspectU.value = visibleW / visibleH
    handle.invalidate()
  }

  /* ── pointer → stroke splats ───────────────────────────────────────── */
  let pointer: { x: number; y: number; at: number } | null = null
  let previous: { x: number; y: number; at: number } | null = null
  let lastSeen = 0
  let lastTick = 0

  const toSimUv = (world: Vector3) => {
    const min = worldMinU.value
    const inv = worldSizeInvU.value
    return new Vector2((world.x - min.x) * inv.x, (world.y - min.y) * inv.y)
  }
  const onPointerMove = (event: PointerEvent) => {
    const rect = el.getBoundingClientRect()
    const ndc = new Vector3(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      0.5
    ).unproject(camera)
    const direction = ndc.sub(camera.position).normalize()
    const world = camera.position.clone().add(direction.multiplyScalar(-camera.position.z / direction.z))
    const sim = toSimUv(world)
    pointer = { x: sim.x, y: sim.y, at: performance.now() }
    lastSeen = pointer.at
    handle.invalidate()
  }
  const onPointerLeave = () => {
    pointer = null
    previous = null
  }
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerleave', onPointerLeave)

  const handle = stage.addView(el, {
    scene,
    camera,
    resize(width, height) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      frame()
    },
    // one sim step per frame; keep rendering until the ink has soaked away
    update() {
      const now = performance.now()
      const dt = Math.min(1 / 30, (now - (lastTick || now)) / 1000 || 1 / 60)
      lastTick = now
      const active = pointer !== null || now - lastSeen < SETTLE_MS
      if (!active) return false

      const aspect = aspectU.value
      if (pointer) {
        const from = previous ?? pointer
        splatA.value.set(from.x * aspect, from.y)
        splatB.value.set(pointer.x * aspect, pointer.y)
        const dtMove = Math.max(1e-3, (pointer.at - from.at) / 1000)
        // stroke velocity, clamped so flicks don't tear the field apart
        const vx = (pointer.x - from.x) / dtMove
        const vy = (pointer.y - from.y) / dtMove
        const speed = Math.hypot(vx, vy)
        const limit = 2.5
        const k = speed > limit ? limit / speed : 1
        splatVelU.value.set(vx * k * 0.9, vy * k * 0.9)
        // ink is purely motion-driven — a resting cursor splats nothing,
        // so the pool always dissipates to zero instead of self-refreshing
        inkStrengthU.value = Math.min(1, speed * 0.7)
        previous = { ...pointer }
      } else {
        // off-canvas: no splat, the sim just advects and fades
        splatA.value.set(-10, -10)
        splatB.value.set(-10, -10)
        splatVelU.value.set(0, 0)
        inkStrengthU.value = 0
      }
      dtU.value = dt

      // ping-pong: read → write, then everything samples the fresh state
      const renderer = stage.renderer
      renderer.setRenderTarget(write)
      quad.render(renderer)
      renderer.setRenderTarget(null)
      ;[read, write] = [write, read]
      here.value = read.texture
      back.value = read.texture
      fieldTex.value = read.texture
      return true
    },
  })
  text.onChange(() => handle.invalidate())

  // clear both sim targets and compile the sim pipeline off the hot path
  for (const target of targets) {
    stage.renderer.setRenderTarget(target)
    stage.renderer.clear()
  }
  stage.renderer.setRenderTarget(null)

  await text.warmup(stage.renderer, camera, scene)
  frame()

  return {
    dispose() {
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerleave', onPointerLeave)
      handle.dispose()
      for (const target of targets) target.dispose()
      simMaterial.dispose()
      water.geometry.dispose()
      waterMaterial.dispose()
      text.dispose({ map: false })
    },
  }
}
