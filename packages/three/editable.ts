/* A text document you can edit in the scene: the document's text, a blinking
 * caret and a selection highlight drawn with it, hit-testing from the pointer
 * (a ray onto the text's plane) and the caret's place on screen, for a hidden
 * input field to follow. It draws and measures; it never reads the keyboard.
 * `attachEditor` (lettra/editor) wires an input to it, or bring your own. */

import {
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicNodeMaterial,
  Object3D,
  Plane,
  PlaneGeometry,
  Raycaster,
  Vector2,
  Vector3,
} from 'three/webgpu'
import type { Camera, ColorRepresentation } from 'three/webgpu'
import type { TextPoint, TextSelection } from '../core/caret'
import { createTextDocument, fitsDocument } from './document'
import type { CaretMove, CreateTextDocumentOptions, DocumentBlock, TextDocument } from './document'
import type { TextEffect } from './material'

export interface CreateEditableDocumentOptions<
  E extends TextEffect | undefined = undefined,
> extends CreateTextDocumentOptions<E> {
  caret?: {
    color?: ColorRepresentation
    /** In ems of the block the caret stands in. Default 0.1. */
    width?: number
    /** Seconds per blink, on then off. Default 1.06. */
    period?: number
    /** Seconds the caret holds still after it moves. Default 0.5. */
    hold?: number
  }
  selection?: {
    color?: ColorRepresentation
    opacity?: number
    /** Most highlighted lines drawn at once. Default 96. */
    capacity?: number
  }
  /** How far past the text area a press still lands in it, in world units. Default 0. */
  margin?: number
}

export interface ScreenCaret {
  /** The top of the caret's line, CSS px from the viewport's top-left. */
  x: number
  y: number
  /** The line's height on screen, CSS px. */
  height: number
  /** The angle the line runs at on screen, radians clockwise. */
  angle: number
}

export interface EditableDocument<E extends TextEffect | undefined = undefined> {
  /** Add this to the scene: the text, the selection behind it, the caret over it. */
  group: Group
  document: TextDocument<E>
  readonly doc: DocumentBlock[]
  readonly selection: TextSelection | null
  readonly editing: boolean
  setDoc(blocks: DocumentBlock[]): void
  setSelection(selection: TextSelection | null): void
  /** Shows the caret and the selection while true. */
  setEditing(editing: boolean): void
  /** The caret position under normalised device coordinates, or undefined off the text area. */
  pointAt(ndcX: number, ndcY: number, camera: Camera): TextPoint | undefined
  /** The caret's line on a `width` × `height` viewport, or undefined with no selection. */
  caretOnScreen(camera: Camera, width: number, height: number): ScreenCaret | undefined
  move(point: TextPoint, direction: CaretMove, goalX?: number): { point: TextPoint; goalX: number }
  /** Whether the document takes `next` in place of `previous` (see `fitsDocument`). */
  fits(next: DocumentBlock[], previous: DocumentBlock[]): boolean
  /** Whether every loaded face can set `char` (anything else draws as `?`). */
  supports(char: string): boolean
  /** Call every frame: blinks the caret. Under reduced motion it holds steady. */
  update(options?: { now?: number; reduced?: boolean }): void
  dispose(): void
}

const collapsed = (selection: TextSelection | null) =>
  !!selection && selection.anchor.block === selection.head.block && selection.anchor.offset === selection.head.offset

export function createEditableDocument<E extends TextEffect | undefined = undefined>(
  options: CreateEditableDocumentOptions<E>
): EditableDocument<E> {
  const { family, width } = options
  const margin = options.margin ?? 0
  const caretWidth = options.caret?.width ?? 0.1
  const blink = { period: options.caret?.period ?? 1.06, hold: options.caret?.hold ?? 0.5 }
  const capacity = options.selection?.capacity ?? 96
  const textOrder = options.renderOrder ?? 0

  const document = createTextDocument<E>({ ...options, renderOrder: textOrder })
  const group = new Group()
  group.name = 'lettra editable document'
  group.add(document.group)

  // the selection behind the text, a rectangle per line; the caret above it
  const highlight = new InstancedMesh(
    new PlaneGeometry(1, 1).translate(0.5, -0.5, 0),
    new MeshBasicNodeMaterial({
      color: options.selection?.color ?? '#a9cbb9',
      transparent: true,
      opacity: options.selection?.opacity ?? 0.55,
      depthWrite: false,
    }),
    capacity
  )
  highlight.count = 0
  highlight.frustumCulled = false
  highlight.renderOrder = textOrder - 1
  const caret = new Mesh(
    new PlaneGeometry(1, 1).translate(0.5, -0.5, 0),
    new MeshBasicNodeMaterial({
      color: options.caret?.color ?? options.material?.fill ?? '#000000',
      transparent: true,
      depthWrite: false,
    })
  )
  caret.renderOrder = textOrder + 1
  caret.visible = false
  group.add(highlight, caret)

  let selection: TextSelection | null = null
  let editing = false
  let caretMovedAt = 0
  /** Whether the caret's line is drawn: a restyle can push it past maxHeight, where the caret hides with its text. */
  let caretShown = true
  const dummy = new Object3D()

  function place() {
    const rects = editing && selection && document.placed.length ? document.selectionRects(selection) : []
    highlight.count = Math.min(rects.length, capacity)
    for (let i = 0; i < highlight.count; i++) {
      const [x, y, rectWidth, rectHeight] = rects[i]
      dummy.position.set(x, y, -0.001)
      dummy.scale.set(Math.max(rectWidth, 1e-4), rectHeight, 1)
      dummy.updateMatrix()
      highlight.setMatrixAt(i, dummy.matrix)
    }
    highlight.instanceMatrix.needsUpdate = true
    if (!selection || !document.placed.length) return
    caretShown = document.isShown(selection.head)
    const at = document.caretAt(selection.head)
    // a firm bar spanning the letters (an em, from the cap height down past
    // the baseline) rather than the whole line box
    const barWidth = at.em * caretWidth
    caret.position.set(at.x - barWidth / 2, at.y - at.baseline + at.em * 0.8, 0.001)
    caret.scale.set(barWidth, at.em, 1)
  }

  const ray = new Raycaster()
  const plane = new Plane()
  const hit = new Vector3()
  const pointer = new Vector2()
  const normal = new Vector3()
  const origin = new Vector3()
  const projected = new Vector3()

  /** The point on the text's plane under normalised device coordinates, in text-area units, or undefined off it. */
  function areaHit(x: number, y: number, camera: Camera) {
    group.updateWorldMatrix(true, false)
    normal.set(0, 0, 1).transformDirection(group.matrixWorld)
    plane.setFromNormalAndCoplanarPoint(normal, origin.setFromMatrixPosition(group.matrixWorld))
    ray.setFromCamera(pointer.set(x, y), camera)
    if (!ray.ray.intersectPlane(plane, hit)) return undefined
    group.worldToLocal(hit)
    const depth = Math.min(options.maxHeight ?? Infinity, document.height)
    const inside = hit.x >= -margin && hit.x <= width + margin && hit.y <= margin && hit.y >= -depth - margin
    return inside ? hit : undefined
  }

  const project = (x: number, y: number, camera: Camera, viewWidth: number, viewHeight: number) => {
    projected.set(x, y, 0)
    group.localToWorld(projected).project(camera)
    return { x: ((projected.x + 1) / 2) * viewWidth, y: ((1 - projected.y) / 2) * viewHeight }
  }

  return {
    group,
    document,
    get doc() {
      return document.blocks
    },
    get selection() {
      return selection
    },
    get editing() {
      return editing
    },
    setDoc(blocks) {
      document.set(blocks)
      place()
    },
    setSelection(next) {
      selection = next
      caretMovedAt = performance.now()
      place()
    },
    setEditing(next) {
      editing = next
      caretMovedAt = performance.now()
      place()
    },
    pointAt(ndcX, ndcY, camera) {
      if (!document.placed.length) return undefined
      const at = areaHit(ndcX, ndcY, camera)
      return at && document.pointAt(at.x, at.y)
    },
    caretOnScreen(camera, viewWidth, viewHeight) {
      if (!selection || !document.placed.length) return undefined
      const at = document.caretAt(selection.head)
      group.updateWorldMatrix(true, false)
      const top = project(at.x, at.y, camera, viewWidth, viewHeight)
      const bottom = project(at.x, at.y - at.height, camera, viewWidth, viewHeight)
      const along = project(at.x + at.em, at.y, camera, viewWidth, viewHeight)
      return {
        x: top.x,
        y: top.y,
        height: Math.hypot(bottom.x - top.x, bottom.y - top.y),
        angle: Math.atan2(along.y - top.y, along.x - top.x),
      }
    },
    move: (point, direction, goalX) => document.move(point, direction, goalX),
    fits: (next, previous) => fitsDocument(document.overflow, next, previous),
    supports(char) {
      if (char === ' ') return true
      const fonts = family.variants
        .filter((entry) => entry.state === 'loaded')
        .map((entry) => family.get({ weight: entry.weight, style: entry.style })?.font)
      return fonts.length > 0 && fonts.every((font) => font !== undefined && char in font.glyphs)
    },
    update({ now = performance.now(), reduced = false } = {}) {
      const since = (now - caretMovedAt) / 1000
      const blinkOn = reduced || since < blink.hold || (since - blink.hold) % blink.period < blink.period / 2
      caret.visible = editing && collapsed(selection) && blinkOn && caretShown && document.placed.length > 0
    },
    dispose() {
      document.dispose()
      highlight.geometry.dispose()
      ;(highlight.material as MeshBasicNodeMaterial).dispose()
      highlight.dispose()
      caret.geometry.dispose()
      ;(caret.material as MeshBasicNodeMaterial).dispose()
    },
  }
}
