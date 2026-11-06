/* Live editing for an `EditableDocument`, out of the box. The document is
 * drawn by lettra in the scene; its text lives in a Tiptap editor over a
 * hidden field that owns the input (typing, IME, undo, clipboard). Every
 * change goes to the document, which sets the text and draws the caret and
 * the selection; the field follows the 3D caret so an IME's window opens
 * beside it.
 *
 * The hidden field lays its text out in its own box, not in lettra's lines,
 * so the moves that depend on lines (up, down, Home, End) and every pointer
 * press are answered from lettra's layout instead. */

import { Editor, Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { sentenceAt, wordAt } from '../core/caret'
import type { TextPoint, TextSelection } from '../core/caret'
import type { CaretMove, DocumentBlock } from '../three/document'
import type { EditableDocument } from '../three/editable'
import { lettraExtensions, readBlocks, selectPoints, toContent, toSelection } from './schema'

/** The view the editor drives: any `EditableDocument`, or your own with the same surface. */
export type EditorView = Pick<
  EditableDocument<any>,
  'doc' | 'setDoc' | 'setSelection' | 'setEditing' | 'pointAt' | 'caretOnScreen' | 'move' | 'fits' | 'supports'
>

/** A camera `pointAt` and `caretOnScreen` accept. */
type ViewCamera = Parameters<EditorView['pointAt']>[2]

export interface AttachEditorOptions {
  view: EditorView
  /** The camera the document is seen through, read on every press and `sync`. */
  camera: () => ViewCamera
  /** The element the scene is drawn in (the canvas): presses on it reach the
   * text, and normalised device coordinates are measured against its box. */
  target: HTMLElement
  /** The field's accessible name. */
  label?: string
  /** The weight Mod-b and `toggleBold` set. Default 700. */
  boldWeight?: number
  /** Your own field to host the editor; one is made and appended to
   * `container` otherwise. It is styled inline to stay invisible. */
  field?: HTMLElement
  /** Where the made field goes. Default `document.body`. */
  container?: HTMLElement
  /** Presses inside elements matching this selector (your toolbar) neither
   * reach the text nor end editing. */
  ignore?: string
  /** Whether a touch on the text starts editing. Default false: on touch
   * screens a touch on the text is the start of a scroll, and the software
   * keyboard would resize the viewport. */
  touch?: boolean
  /** Where focus goes when editing ends with Escape (an Edit button). */
  returnFocus?: () => HTMLElement | null | undefined
}

export interface EditorEvents {
  /** The document's blocks changed. */
  change: DocumentBlock[]
  /** The caret or the selection moved. */
  selection: TextSelection
  /** Editing started or ended. */
  editing: boolean
  /** A selection started or stopped being made (a drag, or Shift held). */
  selecting: boolean
}

export interface SpacingState {
  kind: DocumentBlock['kind']
  /** Null when the block keeps its kind's default. */
  leading: number | null
  tracking: number | null
}

export interface LettraEditor {
  /** The Tiptap editor: chain its commands for anything not covered here. */
  editor: Editor
  /** The hidden field the editor types into. */
  field: HTMLElement
  readonly editing: boolean
  /** Whether a selection is still being made (a drag, or Shift held): wait for it to settle before floating a toolbar over it. */
  readonly selecting: boolean
  /** Starts editing, the caret at `at`, or where the last edit left off (at the end the first time). */
  enter(at?: TextPoint): void
  exit(options?: { returnFocus?: boolean }): void
  /** Call every frame while editing (or whenever the camera or the text
   * moves): keeps the hidden field at the 3D caret. */
  sync(): void
  isBold(): boolean
  isItalic(): boolean
  toggleBold(): void
  toggleItalic(): void
  /** The caret block's line height and letter spacing. */
  spacing(): SpacingState
  /** Sets line height or letter spacing on every block the selection touches. */
  setSpacing(name: 'leading' | 'tracking', value: number | null): void
  on<K extends keyof EditorEvents>(event: K, listener: (value: EditorEvents[K]) => void): () => void
  destroy(): void
}

const LINE_MOVES: Record<string, CaretMove> = { ArrowUp: 'up', ArrowDown: 'down', Home: 'lineStart', End: 'lineEnd' }

/** Invisible, unclickable, and out of the page's flow; placed at the caret by `sync`. */
const FIELD_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  top: '0',
  left: '0',
  transformOrigin: '0 0',
  width: '24ch',
  height: 'var(--caret-height, 1.5em)',
  overflow: 'hidden',
  opacity: '0',
  pointerEvents: 'none',
  fontSize: '16px',
  whiteSpace: 'pre-wrap',
  caretColor: 'transparent',
}

/** Clicks in a row on the same spot: pointer events carry no reliable click count. */
const STREAK = { distance: 6, interval: 450 } as const

export function attachEditor(options: AttachEditorOptions): LettraEditor {
  const { view, camera, target, ignore, touch = false } = options
  const boldWeight = options.boldWeight ?? 700
  const ownField = !options.field
  const field = options.field ?? document.createElement('div')
  Object.assign(field.style, FIELD_STYLE)
  field.dataset.slot = 'lettra-field'
  field.inert = true
  if (ownField) (options.container ?? document.body).append(field)

  const listeners: { [K in keyof EditorEvents]: Set<(value: EditorEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    editing: new Set(),
    selecting: new Set(),
  }
  const emit = <K extends keyof EditorEvents>(event: K, value: EditorEvents[K]) =>
    listeners[event].forEach((listener) => listener(value))

  let editing = false
  let hasEdited = false
  let dragging: TextPoint | undefined
  let shiftHeld = false
  let selecting = false
  /** The x the caret keeps on its way up and down the lines, until something else moves it. */
  let goalX: number | undefined

  const updateSelecting = () => {
    const next = dragging !== undefined || shiftHeld
    if (next === selecting) return
    selecting = next
    emit('selecting', next)
  }

  const keepToTheText = (text: string) => [...text].filter(view.supports).join('')

  // refuses edits the document can't show: a character no face has (it would
  // draw as `?`), or text running past the document's maxHeight
  const Guard = Extension.create({
    name: 'lettraGuard',
    addProseMirrorPlugins: () => [
      new Plugin({
        filterTransaction(transaction, state) {
          if (!transaction.docChanged) return true
          const next = readBlocks(transaction.doc)
          return next.every((block) => [...block.text].every(view.supports)) && view.fits(next, readBlocks(state.doc))
        },
      }),
    ],
  })

  function exit({ returnFocus = false }: { returnFocus?: boolean } = {}) {
    if (!editing) return
    editing = false
    field.inert = true
    editor.view.dom.blur()
    view.setEditing(false)
    view.setSelection(null)
    emit('editing', false)
    if (returnFocus) options.returnFocus?.()?.focus({ preventScroll: true })
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      exit({ returnFocus: true })
      return true
    }
    const direction = LINE_MOVES[event.key]
    if (!direction || event.altKey || event.metaKey || event.ctrlKey) return false
    const { anchor, head } = toSelection(editor)
    const vertical = direction === 'up' || direction === 'down'
    const moved = view.move(head, direction, vertical ? goalX : undefined)
    selectPoints(editor, event.shiftKey ? anchor : moved.point, moved.point)
    goalX = vertical ? moved.goalX : undefined
    return true
  }

  const editor = new Editor({
    element: field,
    injectCSS: false,
    extensions: [...lettraExtensions({ boldWeight }), Guard],
    content: toContent(view.doc),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': options.label ?? 'Text',
        spellcheck: 'false',
        autocomplete: 'off',
        style: 'outline: none',
      },
      // the field is hidden and fixed at the caret: scrolling it into view would scroll the page
      handleScrollToSelection: () => true,
      handleKeyDown: (_view, event) => handleKey(event),
      // pasted text comes in plain, kept to what the faces can set, in the marks at the caret
      handlePaste(prosemirror, event) {
        const text = keepToTheText((event.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' '))
        if (text) prosemirror.dispatch(prosemirror.state.tr.insertText(text))
        return true
      },
      handleDrop: () => true,
    },
  })

  let lastDoc = editor.state.doc
  let lastSelection = editor.state.selection
  editor.on('transaction', () => {
    const { doc, selection } = editor.state
    const docChanged = doc !== lastDoc
    if (docChanged) {
      const blocks = readBlocks(doc)
      view.setDoc(blocks)
      emit('change', blocks)
    }
    if (editing && (docChanged || !selection.eq(lastSelection))) {
      const next = toSelection(editor)
      view.setSelection(next)
      emit('selection', next)
    }
    lastDoc = doc
    lastSelection = selection
  })

  // anything but a line move forgets the goal x
  const forgetGoal = (event: KeyboardEvent) => {
    if (!LINE_MOVES[event.key]) goalX = undefined
  }
  editor.view.dom.addEventListener('keydown', forgetGoal)

  function enter(at?: TextPoint) {
    if (!editing) {
      editing = true
      // the field must take focus, and focus on an inert element is dropped
      field.inert = false
      view.setEditing(true)
      emit('editing', true)
    }
    editor.view.dom.focus({ preventScroll: true })
    const { doc } = editor.state
    const end = { block: doc.childCount - 1, offset: doc.lastChild?.content.size ?? 0 }
    if (at || !hasEdited) selectPoints(editor, at ?? end)
    hasEdited = true
    const selection = toSelection(editor)
    view.setSelection(selection)
    emit('selection', selection)
  }

  /** The text under a client point, measured against the target's box. */
  function pointUnder(clientX: number, clientY: number) {
    const box = target.getBoundingClientRect()
    if (!box.width || !box.height) return undefined
    const ndcX = ((clientX - box.left) / box.width) * 2 - 1
    const ndcY = 1 - ((clientY - box.top) / box.height) * 2
    return view.pointAt(ndcX, ndcY, camera())
  }

  const streak = { count: 0, at: 0, x: 0, y: 0 }
  const countClick = (event: PointerEvent) => {
    const close = Math.hypot(event.clientX - streak.x, event.clientY - streak.y) < STREAK.distance
    streak.count = close && event.timeStamp - streak.at < STREAK.interval ? streak.count + 1 : 1
    Object.assign(streak, { at: event.timeStamp, x: event.clientX, y: event.clientY })
    return streak.count
  }
  const ignored = (eventTarget: EventTarget | null) =>
    eventTarget instanceof Node &&
    (field.contains(eventTarget) ||
      (!!ignore && eventTarget instanceof Element && eventTarget.closest(ignore) !== null))

  // a press places the caret (and starts editing), a drag selects, two clicks
  // take the word, three the sentence, four the block; a press anywhere else
  // ends editing
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || ignored(event.target)) return
    const onTarget = event.target instanceof Node && target.contains(event.target)
    const point =
      onTarget && (touch || event.pointerType !== 'touch') ? pointUnder(event.clientX, event.clientY) : undefined
    if (!point) {
      exit()
      return
    }
    // keeps the field's focus, and the page's own text unselected
    event.preventDefault()
    const clicks = countClick(event)
    goalX = undefined
    if (!editing) {
      enter(point)
      dragging = point
      updateSelecting()
      return
    }
    editor.view.dom.focus({ preventScroll: true })
    if (clicks > 1) {
      const text = editor.state.doc.child(point.block).textContent
      const [start, end] =
        clicks === 2 ? wordAt(text, point.offset) : clicks === 3 ? sentenceAt(text, point.offset) : [0, text.length]
      selectPoints(editor, { block: point.block, offset: start }, { block: point.block, offset: end })
      return
    }
    const anchor = event.shiftKey ? toSelection(editor).anchor : point
    selectPoints(editor, anchor, point)
    dragging = anchor
    updateSelecting()
  }
  const up = () => {
    if (dragging === undefined) return
    dragging = undefined
    updateSelecting()
  }
  const move = (event: PointerEvent) => {
    // a release the page never heard (let go outside the window) still ends the drag
    if (dragging && event.buttons === 0) return up()
    if (!dragging || !editing) return
    const point = pointUnder(event.clientX, event.clientY)
    if (point) selectPoints(editor, dragging, point)
  }

  // a Shift's keyup can go missing (a screenshot shortcut takes it): pointer
  // events carry whether Shift is held too, so any move or press corrects it
  const trackShift = (event: KeyboardEvent | PointerEvent) => {
    if (shiftHeld === event.shiftKey) return
    shiftHeld = event.shiftKey
    updateSelecting()
  }
  const releaseShift = () => {
    shiftHeld = false
    updateSelecting()
  }

  document.addEventListener('pointerdown', down)
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerup', up, { passive: true })
  document.addEventListener('pointercancel', up, { passive: true })
  document.addEventListener('keydown', trackShift)
  document.addEventListener('keyup', trackShift)
  document.addEventListener('pointermove', trackShift, { passive: true })
  document.addEventListener('pointerdown', trackShift, { passive: true })
  window.addEventListener('blur', releaseShift)

  const chain = () => editor.chain().focus(undefined, { scrollIntoView: false })
  const isBold = () => editor.isActive('weight', { weight: boldWeight })

  return {
    editor,
    field,
    get editing() {
      return editing
    },
    get selecting() {
      return selecting
    },
    enter,
    exit,
    sync() {
      if (!editing) return
      const box = target.getBoundingClientRect()
      const caret = view.caretOnScreen(camera(), box.width, box.height)
      if (!caret) return
      field.style.transform = `translate(${box.left + caret.x}px, ${box.top + caret.y}px)`
      field.style.setProperty('--caret-height', `${caret.height}px`)
    },
    isBold,
    isItalic: () => editor.isActive('italic'),
    toggleBold() {
      if (isBold()) chain().unsetMark('weight').run()
      else chain().setMark('weight', { weight: boldWeight }).run()
    },
    toggleItalic() {
      chain().toggleMark('italic').run()
    },
    spacing() {
      const kind = editor.isActive('heading') ? 'heading' : 'paragraph'
      const attributes = editor.getAttributes(kind)
      return {
        kind,
        leading: (attributes.leading as number | null | undefined) ?? null,
        tracking: (attributes.tracking as number | null | undefined) ?? null,
      }
    },
    setSpacing(name, value) {
      editor
        .chain()
        .updateAttributes('paragraph', { [name]: value })
        .updateAttributes('heading', { [name]: value })
        .run()
    },
    on(event, listener) {
      listeners[event].add(listener)
      return () => listeners[event].delete(listener)
    },
    destroy() {
      exit()
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('keydown', trackShift)
      document.removeEventListener('keyup', trackShift)
      document.removeEventListener('pointermove', trackShift)
      document.removeEventListener('pointerdown', trackShift)
      window.removeEventListener('blur', releaseShift)
      editor.view.dom.removeEventListener('keydown', forgetGoal)
      editor.destroy()
      if (ownField) field.remove()
      Object.values(listeners).forEach((set) => set.clear())
    },
  }
}
