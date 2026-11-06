/* A document of rich text blocks (headings and paragraphs) stacked down a
 * page. A rich text has one size and lays out one paragraph, so each block is
 * its own handle at its own scale, and the stacking happens here. A change
 * rebuilds only the blocks it touches; the ones below just move.
 *
 * Units: world units, x from the text area's left edge, y up from its top (the
 * text runs down into negative y). Each block keeps a caret layout beside its
 * handle, in the handle's layout px, computed from the same runs the handle
 * draws (`resolveRichRuns`). */

import { Group, Mesh } from 'three/webgpu'
import type { Material } from 'three/webgpu'
import { caretLayout, lineEdge, nearestOnLine, verticalMove } from '../core/caret'
import type { CaretLayout, TextPoint, TextSelection } from '../core/caret'
import type { FontStyle, VariantKey } from '../core/family'
import type { LayoutOptions } from '../core/types'
import type { FontFamily } from './family'
import type { TextEffect, TextMaterialOptions } from './material'
import { createRichText, resolveRichRuns } from './rich-text'
import type { RichSpan, RichTextHandle } from './rich-text'

/** A run of a block's text set apart from its base face: [start, end), a weight, italic, or both. */
export interface DocumentSpan {
  start: number
  end: number
  weight?: number
  italic?: boolean
}

export type DocumentBlockKind = 'paragraph' | 'heading'

export interface DocumentBlock {
  kind: DocumentBlockKind
  /** Headings only. Default 1. */
  level?: 1 | 2 | 3
  text: string
  spans: DocumentSpan[]
  /** Line height in multiples of the block's size; its kind's own when unset (`type.leading`). */
  leading?: number
  /** Letter spacing in percent of the block's size (Figma's %); 0 when unset. */
  tracking?: number
}

export interface DocumentType {
  /** The body's em, in world units. */
  em: number
  /** Heading sizes, in body ems. */
  heading: Record<1 | 2 | 3, number>
  /** Space after a block, in body ems. */
  after: Record<DocumentBlockKind, number>
  /** Each kind's line height when the block sets none, in multiples of its size. */
  leading: Record<DocumentBlockKind, number>
}

export const DEFAULT_DOCUMENT_TYPE: DocumentType = {
  em: 0.1,
  heading: { 1: 2.15, 2: 1.4, 3: 1.15 },
  after: { paragraph: 1, heading: 0.3 },
  leading: { paragraph: 1.45, heading: 1.12 },
}

export type CaretMove = 'up' | 'down' | 'lineStart' | 'lineEnd'

export interface CreateTextDocumentOptions<E extends TextEffect | undefined = undefined> {
  family: FontFamily
  blocks?: DocumentBlock[]
  /** The text area's width, in world units. */
  width: number
  type?: Partial<DocumentType>
  /** Base weight of every block; spans set others. Default 400. */
  weight?: number
  /** How far down the text area letters may reach, in world units. Lines past
   * it aren't drawn (whole lines, no ellipsis), though they stay in the
   * document and its caret layouts. Unset: no limit. */
  maxHeight?: number
  /** A block's line width at `top` (world units below the text area's top),
   * e.g. a narrower column beside a figure. Default: `width` for every block. */
  measure?: (block: DocumentBlock, top: number, width: number) => number
  /** Shared by every block's materials (fill, opacity, effect). */
  material?: Omit<TextMaterialOptions<E>, 'map' | 'uniforms'>
  /** Applied to every text mesh the document builds. */
  renderOrder?: number
  /** Called once for each material the document's text builds (one per atlas
   * per block, more as faces load and blocks are added), to dress it. */
  onMaterial?: (material: Material) => void
}

interface Placed<E extends TextEffect | undefined> {
  source: DocumentBlock
  handle: RichTextHandle<E>
  /** The base key the handle was built with (fixed for a handle's life), after falling back to loaded faces. */
  base: string
  /** The spans the handle was built with, after falling back to loaded faces. */
  served: string
  caret: CaretLayout
  /** World units per layout px. */
  scale: number
  /** The block's em, in world units. */
  em: number
  /** The line width the block was set to, in world units. */
  width: number
  /** The block's first line top, in world units below the text area's top. */
  top: number
  height: number
  /** How much of the block's text is drawn: up to the end of its last line within `maxHeight`. */
  shownTo: number
  /** How many of its lines are drawn, from the first. */
  shownLines: number
}

export type PlacedBlock = Pick<Placed<undefined>, 'source' | 'caret' | 'scale' | 'em' | 'top' | 'height' | 'shownLines'>

export interface CaretRect {
  x: number
  /** The line's top. */
  y: number
  /** The line's height. */
  height: number
  /** Line top → baseline. */
  baseline: number
  /** The block's em. */
  em: number
}

export interface TextDocument<E extends TextEffect | undefined = undefined> {
  group: Group
  readonly blocks: DocumentBlock[]
  /** The stacked blocks' total height, in world units. */
  readonly height: number
  readonly placed: readonly PlacedBlock[]
  /** Sets `blocks`, rebuilding only the ones that changed (or whose served faces did). */
  set(blocks: DocumentBlock[]): void
  /** Re-sets the current blocks: call after more faces load, so spans waiting on them pick them up. */
  refresh(): void
  /** How many caret places in `blocks` would fall past `maxHeight`, where nothing is drawn. */
  overflow(blocks: DocumentBlock[]): number
  caretAt(point: TextPoint): CaretRect
  /** The offset under a point (world units, text-area space). */
  pointAt(x: number, y: number): TextPoint
  /** Whether the line `point` stands on is drawn, rather than past `maxHeight`. */
  isShown(point: TextPoint): boolean
  /** One rectangle per drawn line the selection covers: [x, top y, width, height]. */
  selectionRects(selection: TextSelection): [number, number, number, number][]
  /** The caret one line up or down (into the next block when it leaves this
   * one), or to its line's start or end. `goalX` is the x it keeps while
   * moving up and down; pass back the returned one until something else
   * moves the caret. */
  move(point: TextPoint, direction: CaretMove, goalX?: number): { point: TextPoint; goalX: number }
  dispose(): void
  /** Each block's rich text handle, in order: tween their `uniforms` to animate the text. */
  readonly handles: readonly RichTextHandle<E>[]
}

const loadedVariants = (family: FontFamily) => family.variants.filter((entry) => entry.state === 'loaded')

/** The closest of `weights` to `weight`, the heavier on a tie, so a bold span
 * still reads bolder than its paragraph while the bolder bakes load. */
function closestWeight(weights: number[], weight: number) {
  let best = weights[0]
  for (const candidate of weights) {
    const gap = Math.abs(candidate - weight)
    const bestGap = Math.abs(best - weight)
    if (gap < bestGap || (gap === bestGap && candidate > best)) best = candidate
  }
  return best
}

const resolves = (family: FontFamily, key: VariantKey) => {
  try {
    return family.get(key) !== null
  } catch {
    return false
  }
}

/** `key` if its bake is loaded, otherwise the closest loaded face in its
 * style, otherwise the closest upright one: a span waits in a face that is
 * here rather than failing for one that isn't yet. */
function servedKey(family: FontFamily, key: VariantKey): VariantKey {
  if (resolves(family, key)) return key
  const style: FontStyle = key.style ?? 'normal'
  const loaded = loadedVariants(family)
  const sameStyle = loaded.filter((entry) => entry.style === style)
  const pool = sameStyle.length ? sameStyle : loaded.filter((entry) => entry.style === 'normal')
  if (!pool.length) return key
  return {
    weight: closestWeight([...new Set(pool.map((entry) => entry.weight))], key.weight ?? 400),
    style: pool[0].style,
  }
}

const characterCount = (blocks: DocumentBlock[]) => blocks.reduce((total, block) => total + block.text.length, 0)

/** Whether two documents hold the same words (only their styling may differ). */
export const sameText = (a: DocumentBlock[], b: DocumentBlock[]) =>
  a.length === b.length && a.every((block, index) => block.text === b[index].text)

export function createTextDocument<E extends TextEffect | undefined = undefined>(
  options: CreateTextDocumentOptions<E>
): TextDocument<E> {
  const { family, width, maxHeight = Infinity } = options
  const type: DocumentType = { ...DEFAULT_DOCUMENT_TYPE, ...options.type }
  const baseWeight = options.weight ?? 400
  const measureAt = options.measure ?? ((_block: DocumentBlock, _top: number, lineWidth: number) => lineWidth)
  const group = new Group()
  group.name = 'lettra document'
  const dressed = new WeakSet<Material>()
  let placed: Placed<E>[] = []
  let current: DocumentBlock[] = []

  const sizeOf = (block: DocumentBlock) => (block.kind === 'heading' ? type.heading[block.level ?? 1] : 1)
  const leadingOf = (block: DocumentBlock) => block.leading ?? type.leading[block.kind]

  /** The block's spans as lettra takes them: in loaded faces, empty ones dropped, clipped to the text. */
  function served(block: DocumentBlock) {
    const base = servedKey(family, { weight: baseWeight })
    const spans: RichSpan[] = block.spans
      .filter((span) => span.end > span.start && span.start < block.text.length)
      .map((span) => ({
        ...servedKey(family, { weight: span.weight ?? baseWeight, style: span.italic ? 'italic' : 'normal' }),
        start: span.start,
        end: Math.min(span.end, block.text.length),
      }))
    return { base, spans }
  }

  const keyName = (key: VariantKey) => `${key.weight ?? 400}${key.style ?? 'normal'}`
  const spansName = (spans: RichSpan[]) => spans.map((span) => `${span.start}-${span.end}:${keyName(span)}`).join(',')

  /** Where each block would sit and how much of it is drawn, without building anything. */
  function measure(blocks: DocumentBlock[]) {
    let top = 0
    return blocks.map((block, index) => {
      const servedSpans = served(block)
      const { runs } = resolveRichRuns(family, block.text, servedSpans.spans, servedSpans.base)
      // layout px per em: the reference run font's bake size, as layoutRuns measures in it
      const bakeSize = (runs.find((run) => run.end > run.start) ?? runs[0]).font.size
      const em = type.em * sizeOf(block)
      const scale = em / bakeSize
      const lineWidth = measureAt(block, top, width)
      const layout: LayoutOptions = {
        maxWidth: lineWidth / scale,
        lineHeight: bakeSize * leadingOf(block),
        letterSpacing: ((block.tracking ?? 0) / 100) * bakeSize,
      }
      const caret = caretLayout(block.text, runs, layout)
      const height = caret.lines.length * caret.lineHeight * scale
      // a line reaches down to the bottom of its box or of its letters, whichever is lower
      const lineBottom = (line: number) =>
        top + (line * caret.lineHeight + Math.max(caret.lineHeight, caret.reach)) * scale
      const shownLines = caret.lines.filter((_, line) => lineBottom(line) <= maxHeight)
      const shownTo = Math.min(shownLines.at(-1)?.to ?? 0, block.text.length)
      // the caret places past maxHeight: the characters there, and the block's
      // own start when all of it is, so an empty block out of sight counts too
      const hidden = shownLines.length ? block.text.length - shownTo : block.text.length + 1
      const entry = {
        servedSpans,
        em,
        scale,
        width: lineWidth,
        layout,
        caret,
        top,
        height,
        shownTo,
        shownLines: shownLines.length,
        hidden,
      }
      top += height + (index < blocks.length - 1 ? type.em * type.after[block.kind] : 0)
      return entry
    })
  }

  function dress(handle: RichTextHandle<E>) {
    for (const mesh of handle.group.children) {
      if (!(mesh instanceof Mesh)) continue
      if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder
      if (Array.isArray(mesh.material) || dressed.has(mesh.material)) continue
      dressed.add(mesh.material)
      options.onMaterial?.(mesh.material)
    }
  }

  const disposeEntry = (entry: Placed<E>) => {
    group.remove(entry.handle.group)
    entry.handle.dispose()
  }

  function set(blocks: DocumentBlock[]) {
    const layouts = measure(blocks)
    const next: Placed<E>[] = blocks.map((block, index) => {
      const {
        servedSpans,
        em,
        scale,
        width: lineWidth,
        layout,
        caret,
        top,
        height,
        shownTo,
        shownLines,
      } = layouts[index]
      // the drawn text stops at the end of the last line within maxHeight
      const shownText = block.text.slice(0, shownTo)
      const shownSpans = servedSpans.spans
        .filter((span) => span.start < shownText.length)
        .map((span) => (span.end > shownText.length ? { ...span, end: shownText.length } : span))
      const base = keyName(servedSpans.base)
      const servedName = spansName(servedSpans.spans)
      const previous = placed[index]
      let handle: RichTextHandle<E>
      if (previous && previous.scale === scale && previous.base === base) {
        handle = previous.handle
        const unchanged =
          previous.source.text === block.text &&
          previous.served === servedName &&
          previous.source.leading === block.leading &&
          previous.source.tracking === block.tracking &&
          previous.width === lineWidth &&
          previous.shownTo === shownTo
        if (!unchanged) handle.setText(shownText, shownSpans, layout)
      } else {
        if (previous) disposeEntry(previous)
        handle = createRichText<E>({
          family,
          text: shownText,
          spans: shownSpans,
          variant: servedSpans.base,
          layout,
          geometry: { scale, anchor: 'baseline-left' },
          material: options.material,
        })
        group.add(handle.group)
      }
      dress(handle)
      handle.group.position.set(0, -top - caret.baseline * scale, 0)
      return {
        source: block,
        handle,
        base,
        served: servedName,
        caret,
        scale,
        em,
        width: lineWidth,
        top,
        height,
        shownTo,
        shownLines,
      }
    })
    placed.slice(blocks.length).forEach(disposeEntry)
    placed = next
    current = blocks
  }

  const entryOf = (block: number) => placed[Math.max(0, Math.min(block, placed.length - 1))]
  const stopOf = (entry: Placed<E>, offset: number) =>
    entry.caret.stops[Math.max(0, Math.min(offset, entry.caret.stops.length - 1))]

  function caretAt({ block, offset }: TextPoint): CaretRect {
    const entry = entryOf(block)
    const stop = stopOf(entry, offset)
    return {
      x: stop.x * entry.scale,
      y: -entry.top - stop.line * entry.caret.lineHeight * entry.scale,
      height: entry.caret.lineHeight * entry.scale,
      baseline: entry.caret.baseline * entry.scale,
      em: entry.em,
    }
  }

  function pointAt(x: number, y: number): TextPoint {
    const down = -y
    let block = placed.findIndex((entry, i) => down < entry.top + entry.height || i === placed.length - 1)
    if (block > 0 && down < placed[block].top) {
      // between two blocks: whichever edge is nearer
      const above = placed[block - 1]
      if (down - (above.top + above.height) < placed[block].top - down) block--
    }
    const entry = placed[block]
    const lineHeight = entry.caret.lineHeight
    const layoutY = (down - entry.top) / entry.scale
    // a point below the drawn lines lands on the last drawn one, not on text out of sight
    const clampedY = Math.min(layoutY, Math.max(0, entry.shownLines - 1) * lineHeight + lineHeight / 2)
    const line = Math.max(0, Math.min(entry.caret.lines.length - 1, Math.floor(clampedY / lineHeight)))
    return { block, offset: nearestOnLine(entry.caret, line, x / entry.scale) }
  }

  function selectionRects({ anchor, head }: TextSelection) {
    const forward = anchor.block < head.block || (anchor.block === head.block && anchor.offset <= head.offset)
    const [from, to] = forward ? [anchor, head] : [head, anchor]
    const rects: [number, number, number, number][] = []
    for (let b = Math.max(0, from.block); b <= to.block && b < placed.length; b++) {
      const entry = placed[b]
      const start = b === from.block ? from.offset : 0
      const end = b === to.block ? to.offset : entry.source.text.length
      entry.caret.lines.forEach((line, index) => {
        const a = Math.max(start, line.from)
        const z = Math.min(end, line.to)
        // a block the selection runs on past shows its end, as a browser shows a selected line break
        const runsOn = b < to.block && index === entry.caret.lines.length - 1
        if (index >= entry.shownLines || z < a || (z === a && !runsOn)) return
        const x0 = entry.caret.stops[a].x * entry.scale
        const x1 = entry.caret.stops[z].x * entry.scale + (runsOn ? entry.em * 0.3 : 0)
        const lineHeight = entry.caret.lineHeight * entry.scale
        rects.push([x0, -entry.top - index * lineHeight, x1 - x0, lineHeight])
      })
    }
    return rects
  }

  function move(point: TextPoint, direction: CaretMove, goalX?: number) {
    const entry = entryOf(point.block)
    const goal = goalX ?? caretAt(point).x
    if (direction === 'lineStart' || direction === 'lineEnd') {
      const offset = lineEdge(entry.caret, point.offset, direction === 'lineStart' ? 'start' : 'end')
      const at = { block: point.block, offset }
      return { point: at, goalX: caretAt(at).x }
    }
    const step = direction === 'up' ? -1 : 1
    const within = verticalMove(entry.caret, point.offset, step, goal / entry.scale)
    if (within !== undefined) return { point: { block: point.block, offset: within }, goalX: goal }
    const block = point.block + step
    if (block < 0) return { point: { block: 0, offset: 0 }, goalX: goal }
    if (block >= placed.length) return { point: { block: point.block, offset: entry.source.text.length }, goalX: goal }
    const target = placed[block]
    const line = step > 0 ? 0 : target.caret.lines.length - 1
    return { point: { block, offset: nearestOnLine(target.caret, line, goal / target.scale) }, goalX: goal }
  }

  if (options.blocks) set(options.blocks)

  return {
    group,
    get blocks() {
      return current
    },
    get height() {
      const last = placed.at(-1)
      return last ? last.top + last.height : 0
    },
    get placed() {
      return placed as unknown as PlacedBlock[]
    },
    get handles() {
      return placed.map((entry) => entry.handle)
    },
    set,
    refresh: () => set(current),
    overflow: (blocks) => measure(blocks).reduce((total, entry) => total + entry.hidden, 0),
    caretAt,
    pointAt,
    isShown: ({ block, offset }) => {
      const entry = entryOf(block)
      return stopOf(entry, offset).line < entry.shownLines
    },
    selectionRects,
    move,
    dispose() {
      placed.forEach(disposeEntry)
      placed = []
    },
  }
}

/** Whether a document may take `next` in place of `previous` under `overflow`:
 * restyling (same words) always may, and what it pushes out of sight comes
 * back when tightened or undone; writing may never push more text past the
 * limit than was already there; anything that shortens the text always may,
 * so a full page can always be cleared. */
export function fitsDocument(
  overflow: (blocks: DocumentBlock[]) => number,
  next: DocumentBlock[],
  previous: DocumentBlock[]
) {
  if (sameText(next, previous)) return true
  const hidden = overflow(next)
  return hidden === 0 || hidden <= overflow(previous) || characterCount(next) < characterCount(previous)
}
