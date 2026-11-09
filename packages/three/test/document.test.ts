import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Texture } from 'three/webgpu'
import { defineFamily } from '../family'
import { createRichText, resolveRichRuns } from '../rich-text'
import { createTextDocument, fitsDocument } from '../document'
import type { DocumentBlock } from '../document'
import { createEditableDocument } from '../editable'
import type { MSDFFont } from '../../core/types'

/* size 10, lineHeight 12, base 9; every advance 10 except space (5) and
 * A/V (9, kerned AV -4). xoffset 0 everywhere. */
const chars = 'abcdefghijklmnopqrstuvwxyzH'
const makeFont = (name: string): MSDFFont => ({
  name,
  size: 10,
  lineHeight: 12,
  base: 9,
  distanceRange: 8,
  atlas: { width: 100, height: 100 },
  glyphs: {
    ...Object.fromEntries([...chars].map((c) => [c, [0, 0, 8, 8, 0, 1, 10]])),
    A: [30, 0, 8, 8, 0, 1, 9],
    V: [40, 0, 8, 8, 0, 1, 9],
    '?': [50, 0, 6, 8, 0, 1, 8],
    ' ': [0, 0, 0, 0, 0, 0, 5],
  } as MSDFFont['glyphs'],
  kerning: { AV: -4 },
})

const fonts: Record<string, MSDFFont> = {
  '/400.json': makeFont('regular'),
  '/700.json': makeFont('bold'),
  '/400i.json': makeFont('italic'),
}

function makeFamily() {
  return defineFamily({
    src: [
      { json: '/400.json', atlas: '/400.png', weight: 400 },
      { json: '/700.json', atlas: '/700.png', weight: 700 },
      { json: '/400i.json', atlas: '/400i.png', weight: 400, style: 'italic' },
    ],
    loaders: { font: (url) => Promise.resolve(fonts[url]), texture: () => Promise.resolve(new Texture()) },
  })
}

async function loadedFamily() {
  const family = makeFamily()
  await family.loadAll()
  return family
}

const paragraph = (text: string, spans: DocumentBlock['spans'] = []): DocumentBlock => ({
  kind: 'paragraph',
  text,
  spans,
})
const heading = (text: string): DocumentBlock => ({ kind: 'heading', level: 1, text, spans: [] })

/* em 1 world unit with 10 px bakes → scale 0.1; a paragraph's line is 1.45
 * units, so 10 px advances are 1 unit wide */
const type = { em: 1, after: { paragraph: 1, heading: 0.5 }, heading: { 1: 2, 2: 1.5, 3: 1.2 } }

describe('rich text caret', () => {
  it('matches the drawn glyphs, kerning kept across a span that lands on the base bake', async () => {
    const family = await loadedFamily()
    const handle = createRichText({ family, text: 'AV ab', spans: [{ start: 1, end: 2, weight: 400 }] })
    for (const glyph of handle.layout.glyphs) expect(handle.caret.stops[glyph.index].x).toBeCloseTo(glyph.x, 6)
    expect(handle.caret.stops[1].x).toBe(5)
    handle.setText('VA')
    expect(handle.caret.stops).toHaveLength(3)
    handle.dispose()
  })

  it('resolves runs the way the handle draws them', async () => {
    const family = await loadedFamily()
    const { runs } = resolveRichRuns(family, 'Hab', [{ start: 1, end: 2, weight: 700 }])
    expect(runs.map((run) => [run.start, run.end, run.font.name])).toEqual([
      [0, 1, 'regular'],
      [1, 2, 'bold'],
      [2, 3, 'regular'],
    ])
  })
})

describe('createTextDocument', () => {
  it('stacks blocks down the page with the space after each kind', async () => {
    const family = await loadedFamily()
    const doc = createTextDocument({
      family,
      width: 100,
      type,
      blocks: [heading('Ha'), paragraph('ab'), paragraph('cd')],
    })
    const [h, p1, p2] = doc.placed
    expect(h.top).toBe(0)
    expect(h.height).toBeCloseTo(2 * 1.12)
    expect(p1.top).toBeCloseTo(h.height + 0.5)
    expect(p2.top).toBeCloseTo(p1.top + p1.height + 1)
    expect(doc.group.children).toHaveLength(3)
    // each block's group sits with its first baseline under its top
    expect(doc.handles[1].group.position.y).toBeCloseTo(-p1.top - 0.9)
    doc.dispose()
  })

  it('round-trips caret places through pointAt', async () => {
    const family = await loadedFamily()
    const doc = createTextDocument({ family, width: 100, type, blocks: [heading('Ha'), paragraph('abc def')] })
    for (const point of [
      { block: 0, offset: 1 },
      { block: 1, offset: 0 },
      { block: 1, offset: 5 },
      { block: 1, offset: 7 },
    ]) {
      const at = doc.caretAt(point)
      expect(doc.pointAt(at.x + 0.01, at.y - at.height / 2)).toEqual(point)
    }
    // far below everything: the last block's nearest place
    expect(doc.pointAt(1000, -1000)).toEqual({ block: 1, offset: 7 })
  })

  it('wraps paragraphs at the measure, and moves the caret across lines and blocks', async () => {
    const family = await loadedFamily()
    const doc = createTextDocument({
      family,
      width: 3.5,
      type,
      blocks: [paragraph('abc def'), paragraph('gh')],
    })
    expect(doc.placed[0].caret.lines).toHaveLength(2)
    const down = doc.move({ block: 0, offset: 1 }, 'down')
    expect(down.point).toEqual({ block: 0, offset: 5 })
    const next = doc.move(down.point, 'down', down.goalX)
    expect(next.point).toEqual({ block: 1, offset: 1 })
    expect(doc.move(next.point, 'down', next.goalX).point).toEqual({ block: 1, offset: 2 })
    expect(doc.move({ block: 0, offset: 0 }, 'up').point).toEqual({ block: 0, offset: 0 })
    expect(doc.move({ block: 0, offset: 5 }, 'lineStart').point).toEqual({ block: 0, offset: 4 })
    expect(doc.move({ block: 0, offset: 1 }, 'lineEnd').point).toEqual({ block: 0, offset: 3 })
  })

  it('highlights one rect per line, and runs on past a block it leaves', async () => {
    const family = await loadedFamily()
    const doc = createTextDocument({ family, width: 3.5, type, blocks: [paragraph('abc def'), paragraph('gh')] })
    const rects = doc.selectionRects({ anchor: { block: 1, offset: 1 }, head: { block: 0, offset: 1 } })
    expect(rects).toHaveLength(3)
    const [first, , last] = rects
    expect(first[0]).toBeCloseTo(1)
    // to the end of the line's last letter: its trimmed space has no width of its own
    expect(first[2]).toBeCloseTo(2)
    expect(last[2]).toBeCloseTo(1)
    expect(doc.selectionRects({ anchor: { block: 1, offset: 1 }, head: { block: 1, offset: 1 } })).toEqual([])
  })

  it('clamps to maxHeight and refuses writing past it, but not restyling or shortening', async () => {
    const family = await loadedFamily()
    const blocks = [paragraph('ab'), paragraph('cd')]
    // one paragraph line is 1.45 tall: room for the first block only
    const doc = createTextDocument({ family, width: 100, type, blocks, maxHeight: 2 })
    expect(doc.placed[1].shownLines).toBe(0)
    expect(doc.isShown({ block: 0, offset: 1 })).toBe(true)
    expect(doc.isShown({ block: 1, offset: 0 })).toBe(false)
    expect(doc.overflow(blocks)).toBe(3)
    const longer = [paragraph('ab'), paragraph('cde')]
    const shorter = [paragraph('ab'), paragraph('c')]
    const restyled = [paragraph('ab', [{ start: 0, end: 1, weight: 700 }]), paragraph('cd')]
    expect(fitsDocument(doc.overflow, longer, blocks)).toBe(false)
    expect(fitsDocument(doc.overflow, shorter, blocks)).toBe(true)
    expect(fitsDocument(doc.overflow, restyled, blocks)).toBe(true)
  })

  it('serves spans from loaded faces while the rest load, then picks them up on refresh', async () => {
    const family = makeFamily()
    await family.load({ weight: 400 })
    const doc = createTextDocument({
      family,
      width: 100,
      type,
      blocks: [paragraph('abcd', [{ start: 1, end: 3, weight: 700, italic: true }])],
    })
    expect(doc.handles[0].group.children).toHaveLength(1)
    await family.loadAll()
    doc.refresh()
    expect(doc.handles[0].group.children).toHaveLength(2)
  })

  it('rebuilds only the blocks that changed', async () => {
    const family = await loadedFamily()
    const doc = createTextDocument({ family, width: 100, type, blocks: [paragraph('ab'), paragraph('cd')] })
    const [first, second] = doc.handles
    let rebuilt = 0
    first.onChange(() => rebuilt++)
    doc.set([paragraph('ab'), paragraph('cde')])
    expect(rebuilt).toBe(0)
    expect(doc.handles[0]).toBe(first)
    expect(doc.handles[1]).toBe(second)
    doc.set([paragraph('ab')])
    expect(doc.group.children).toHaveLength(1)
  })
})

describe('createEditableDocument', () => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(2, -1, 10)
  camera.lookAt(2, -1, 0)
  camera.updateMatrixWorld()

  it('hit-tests through the camera and projects the caret back to the same place', async () => {
    const family = await loadedFamily()
    const editable = createEditableDocument({ family, width: 4, type, blocks: [paragraph('abc')] })
    editable.setSelection({ anchor: { block: 0, offset: 2 }, head: { block: 0, offset: 2 } })
    const screen = editable.caretOnScreen(camera, 800, 800)!
    expect(screen.angle).toBeCloseTo(0)
    const ndcX = (screen.x / 800) * 2 - 1
    const ndcY = 1 - ((screen.y + screen.height / 2) / 800) * 2
    expect(editable.pointAt(ndcX + 0.001, ndcY, camera)).toEqual({ block: 0, offset: 2 })
    // well off the text area
    expect(editable.pointAt(0.99, -0.99, camera)).toBeUndefined()
  })

  it('blinks the caret only while editing a collapsed selection, steady under reduced motion', async () => {
    const family = await loadedFamily()
    const editable = createEditableDocument({ family, width: 4, type, blocks: [paragraph('abc')] })
    const caret = editable.group.children.at(-1)!
    editable.setSelection({ anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 1 } })
    editable.update()
    expect(caret.visible).toBe(false)
    editable.setEditing(true)
    const now = performance.now()
    editable.update({ now })
    expect(caret.visible).toBe(true)
    // past the hold, into the off half of a blink
    editable.update({ now: now + 1100 })
    expect(caret.visible).toBe(false)
    editable.update({ now: now + 1100, reduced: true })
    expect(caret.visible).toBe(true)
    editable.setSelection({ anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 2 } })
    editable.update({ now })
    expect(caret.visible).toBe(false)
  })

  it('supports only what every loaded face can set', async () => {
    const family = await loadedFamily()
    const editable = createEditableDocument({ family, width: 4, type, blocks: [paragraph('abc')] })
    expect(editable.supports('a')).toBe(true)
    expect(editable.supports(' ')).toBe(true)
    expect(editable.supports('é')).toBe(false)
  })
})
