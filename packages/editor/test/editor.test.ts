// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { attachEditor } from '../controller'
import type { EditorView, LettraEditor } from '../controller'
import { lettraExtensions, readBlocks, selectPoints, toContent, toPoint, toPosition, toSelection } from '../schema'
import type { DocumentBlock } from '../../three/document'
import type { TextPoint } from '../../core/caret'

const blocks: DocumentBlock[] = [
  { kind: 'heading', level: 1, text: 'Notes', spans: [{ start: 0, end: 5, weight: 700 }] },
  { kind: 'paragraph', text: 'clear and cold', spans: [{ start: 6, end: 9, italic: true }], leading: 1.6 },
  {
    kind: 'paragraph',
    text: 'one two',
    spans: [{ start: 0, end: 3, weight: 500, italic: true }],
    tracking: 4,
  },
]

const editorFor = (content: DocumentBlock[]) =>
  new Editor({ element: document.createElement('div'), extensions: lettraExtensions(), content: toContent(content) })

describe('schema', () => {
  it('round-trips blocks through the editor document', () => {
    const editor = editorFor(blocks)
    expect(readBlocks(editor.state.doc)).toEqual(blocks)
    editor.destroy()
  })

  it('maps caret points to positions and back, clamped to the document', () => {
    const editor = editorFor(blocks)
    const { doc } = editor.state
    for (const point of [
      { block: 0, offset: 0 },
      { block: 0, offset: 5 },
      { block: 1, offset: 3 },
      { block: 2, offset: 7 },
    ]) {
      expect(toPoint(doc, toPosition(doc, point))).toEqual(point)
    }
    expect(toPoint(doc, toPosition(doc, { block: 9, offset: 99 }))).toEqual({ block: 2, offset: 7 })
    selectPoints(editor, { block: 1, offset: 2 }, { block: 2, offset: 1 })
    expect(toSelection(editor)).toEqual({ anchor: { block: 1, offset: 2 }, head: { block: 2, offset: 1 } })
    editor.destroy()
  })

  it('opens a paragraph, not a heading, on Enter at a heading’s end', () => {
    const editor = editorFor(blocks)
    selectPoints(editor, { block: 0, offset: 5 })
    editor.commands.splitBlock()
    expect(readBlocks(editor.state.doc)[1].kind).toBe('paragraph')
    editor.destroy()
  })
})

/** A view that records what the editor tells it, and answers presses at `pressAt`. */
function stubView(initial: DocumentBlock[]) {
  let doc = initial
  const view = {
    pressAt: undefined as TextPoint | undefined,
    maxCharacters: Infinity,
    editing: false,
    selection: null as unknown,
    get doc() {
      return doc
    },
    setDoc: vi.fn((next: DocumentBlock[]) => {
      doc = next
    }),
    setSelection: vi.fn((next: unknown) => {
      view.selection = next
    }),
    setEditing: vi.fn((next: boolean) => {
      view.editing = next
    }),
    pointAt: vi.fn(() => view.pressAt),
    caretOnScreen: vi.fn(() => ({ x: 10, y: 20, height: 30, angle: 0 })),
    move: vi.fn((point: TextPoint, direction: string) => ({
      point: direction === 'down' ? { block: point.block + 1, offset: 0 } : point,
      goalX: 42,
    })),
    fits: vi.fn(
      (next: DocumentBlock[]) => next.reduce((total, block) => total + block.text.length, 0) <= view.maxCharacters
    ),
    supports: vi.fn((char: string) => /[a-z ]/i.test(char)),
  }
  return view
}

describe('attachEditor', () => {
  let attached: LettraEditor | undefined
  afterEach(() => {
    attached?.destroy()
    attached = undefined
    document.body.innerHTML = ''
  })

  const setup = () => {
    const view = stubView(blocks)
    const target = document.createElement('canvas')
    document.body.append(target)
    target.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    const returnTo = document.createElement('button')
    document.body.append(returnTo)
    attached = attachEditor({
      view: view as unknown as EditorView,
      camera: () => ({}) as never,
      target,
      label: 'Page',
      returnFocus: () => returnTo,
    })
    return { view, target, editor: attached, returnTo }
  }

  const press = (on: Element, init: PointerEventInit = {}) =>
    on.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', ...init }))

  it('makes an invisible, labelled field that only takes focus while editing', () => {
    const { editor } = setup()
    expect(editor.field.isConnected).toBe(true)
    expect(editor.field.style.opacity).toBe('0')
    expect(editor.field.inert).toBe(true)
    expect(editor.editor.view.dom.getAttribute('aria-label')).toBe('Page')
    editor.enter()
    expect(editor.field.inert).toBe(false)
  })

  it('enters at the end of the text the first time, then where the last edit left off', () => {
    const { view, editor } = setup()
    editor.enter()
    expect(view.setEditing).toHaveBeenLastCalledWith(true)
    expect(view.selection).toEqual({ anchor: { block: 2, offset: 7 }, head: { block: 2, offset: 7 } })
    selectPoints(editor.editor, { block: 1, offset: 2 })
    editor.exit()
    expect(view.setSelection).toHaveBeenLastCalledWith(null)
    editor.enter()
    expect(view.selection).toEqual({ anchor: { block: 1, offset: 2 }, head: { block: 1, offset: 2 } })
  })

  it('sends every change to the view, and refuses what it can’t show', () => {
    const { view, editor } = setup()
    editor.enter({ block: 1, offset: 0 })
    editor.editor.commands.insertContent('x')
    expect(view.setDoc).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: 'xclear and cold' })])
    )
    const calls = view.setDoc.mock.calls.length
    editor.editor.commands.insertContent('é')
    expect(view.setDoc.mock.calls.length).toBe(calls)
    view.maxCharacters = 0
    editor.editor.commands.insertContent('y')
    expect(view.setDoc.mock.calls.length).toBe(calls)
  })

  it('answers line moves from the view, and Escape exits returning focus', () => {
    const { view, editor, returnTo } = setup()
    editor.enter({ block: 0, offset: 2 })
    editor.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(view.move).toHaveBeenCalledWith({ block: 0, offset: 2 }, 'down', undefined)
    expect(view.selection).toEqual({ anchor: { block: 1, offset: 0 }, head: { block: 1, offset: 0 } })
    editor.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(view.move).toHaveBeenLastCalledWith({ block: 1, offset: 0 }, 'down', 42)
    editor.editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(editor.editing).toBe(false)
    expect(document.activeElement).toBe(returnTo)
  })

  it('places the caret on a press, takes the word on a double click, and exits on a press elsewhere', () => {
    const { view, target, editor } = setup()
    view.pressAt = { block: 1, offset: 7 }
    press(target, { clientX: 50, clientY: 50 })
    expect(editor.editing).toBe(true)
    expect(view.pointAt).toHaveBeenLastCalledWith(-0.5, 0, expect.anything())
    expect(view.selection).toEqual({ anchor: { block: 1, offset: 7 }, head: { block: 1, offset: 7 } })
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    press(target, { clientX: 50, clientY: 50 })
    expect(view.selection).toEqual({ anchor: { block: 1, offset: 6 }, head: { block: 1, offset: 9 } })
    view.pressAt = undefined
    press(document.body)
    expect(editor.editing).toBe(false)
  })

  it('ignores touches by default, and presses inside ignored UI', () => {
    const { view, target, editor } = setup()
    view.pressAt = { block: 0, offset: 1 }
    press(target, { pointerType: 'touch' })
    expect(editor.editing).toBe(false)
    editor.enter()
    press(editor.field)
    expect(editor.editing).toBe(true)
  })

  it('keeps the field at the caret on sync', () => {
    const { editor } = setup()
    editor.enter()
    editor.sync()
    expect(editor.field.style.transform).toBe('translate(10px, 20px)')
    expect(editor.field.style.getPropertyValue('--caret-height')).toBe('30px')
  })

  it('toggles bold and italic, and sets spacing on the caret’s block', () => {
    const { editor } = setup()
    editor.enter()
    selectPoints(editor.editor, { block: 1, offset: 0 }, { block: 1, offset: 5 })
    editor.toggleBold()
    expect(editor.isBold()).toBe(true)
    editor.toggleItalic()
    expect(readBlocks(editor.editor.state.doc)[1].spans[0]).toEqual({ start: 0, end: 5, weight: 700, italic: true })
    editor.toggleBold()
    expect(editor.isBold()).toBe(false)
    editor.setSpacing('tracking', 10)
    expect(editor.spacing()).toEqual({ kind: 'paragraph', leading: 1.6, tracking: 10 })
  })
})
