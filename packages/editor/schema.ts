/* The editor's schema and the mapping between its document and lettra's
 * blocks. Paragraphs and headings of plain text, an italic mark and a weight
 * mark, plus each block's line height and letter spacing as attributes. The
 * nodes are defined here rather than taken from @tiptap/extension-*, so the
 * only peers are @tiptap/core and @tiptap/pm. */

import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { history, redo, undo } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection as ProseMirrorTextSelection } from '@tiptap/pm/state'
import type { TextPoint, TextSelection } from '../core/caret'
import type { DocumentBlock, DocumentSpan } from '../three/document'

const HEADING_LEVELS = [1, 2, 3] as const

/** Blocks of text, each a textblock at the top of the document, nothing
 * nested. Paragraph comes first on purpose: ProseMirror makes the block that
 * Enter opens of the first type listed, so heading first would turn every
 * new line into a title. */
const LettraDocument = Node.create({ name: 'doc', topNode: true, content: '(paragraph|heading)+' })

const LettraText = Node.create({ name: 'text', group: 'inline' })

const LettraParagraph = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: ({ HTMLAttributes }) => ['p', mergeAttributes(HTMLAttributes), 0],
})

const LettraHeading = Node.create({
  name: 'heading',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes: () => ({ level: { default: 1, rendered: false } }),
  parseHTML: () => HEADING_LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${node.attrs.level}`, mergeAttributes(HTMLAttributes), 0],
})

const LettraItalic = Mark.create({
  name: 'italic',
  parseHTML: () => [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
  renderHTML: ({ HTMLAttributes }) => ['em', mergeAttributes(HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-i': () => this.editor.commands.toggleMark(this.name) }
  },
})

/** A weight other than the block's own, as `data-weight`. Mod-b toggles `bold`. */
const createWeightMark = (bold: number) =>
  Mark.create({
    name: 'weight',
    addAttributes: () => ({
      weight: {
        default: bold,
        parseHTML: (element) => Number(element.getAttribute('data-weight')) || bold,
        renderHTML: (attributes) => ({ 'data-weight': attributes.weight }),
      },
    }),
    parseHTML: () => [{ tag: 'span[data-weight]' }],
    renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes), 0],
    addKeyboardShortcuts() {
      return {
        'Mod-b': () =>
          this.editor.isActive('weight', { weight: bold })
            ? this.editor.commands.unsetMark('weight')
            : this.editor.commands.setMark('weight', { weight: bold }),
      }
    },
  })

/** Each block's line height (`leading`, multiples of its size) and letter
 * spacing (`tracking`, percent of it). Null leaves the block to the
 * document's defaults. */
const BlockSpacing = Extension.create({
  name: 'blockSpacing',
  addGlobalAttributes: () => [
    {
      types: ['paragraph', 'heading'],
      attributes: {
        leading: {
          default: null,
          parseHTML: (element) => Number(element.getAttribute('data-leading')) || null,
          renderHTML: (attributes) => (attributes.leading == null ? {} : { 'data-leading': attributes.leading }),
        },
        tracking: {
          default: null,
          parseHTML: (element) => Number(element.getAttribute('data-tracking')) || null,
          renderHTML: (attributes) => (attributes.tracking == null ? {} : { 'data-tracking': attributes.tracking }),
        },
      },
    },
  ],
})

const UndoRedo = Extension.create({
  name: 'undoRedo',
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    const run = (command: typeof undo) => () => command(this.editor.state, this.editor.view.dispatch)
    return { 'Mod-z': run(undo), 'Shift-Mod-z': run(redo), 'Mod-y': run(redo) }
  },
})

/** The extensions of a lettra document: blocks, marks, spacing and history. */
export function lettraExtensions({ boldWeight = 700 }: { boldWeight?: number } = {}) {
  return [
    LettraDocument,
    LettraParagraph,
    LettraHeading,
    LettraText,
    LettraItalic,
    createWeightMark(boldWeight),
    BlockSpacing,
    UndoRedo,
  ]
}

/** The blocks as lettra sets them: each textblock's text, and a span per run of marked text. */
export function readBlocks(doc: ProseMirrorNode): DocumentBlock[] {
  const blocks: DocumentBlock[] = []
  doc.forEach((node) => {
    const spans: DocumentSpan[] = []
    // ProseMirror already splits text nodes wherever their marks change, so each one is a span (or plain text)
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) return
      const weight = child.marks.find((mark) => mark.type.name === 'weight')?.attrs.weight as number | undefined
      const italic = child.marks.some((mark) => mark.type.name === 'italic')
      if (weight === undefined && !italic) return
      const span: DocumentSpan = { start: offset, end: offset + child.text.length }
      if (weight !== undefined) span.weight = weight
      if (italic) span.italic = true
      const last = spans[spans.length - 1]
      if (last && last.end === span.start && last.weight === span.weight && last.italic === span.italic)
        last.end = span.end
      else spans.push(span)
    })
    const heading = node.type.name === 'heading'
    const block: DocumentBlock = { kind: heading ? 'heading' : 'paragraph', text: node.textContent, spans }
    if (heading) block.level = node.attrs.level as 1 | 2 | 3
    if (node.attrs.leading != null) block.leading = node.attrs.leading as number
    if (node.attrs.tracking != null) block.tracking = node.attrs.tracking as number
    blocks.push(block)
  })
  return blocks
}

/** The editor's document for `blocks`, as Tiptap JSON. */
export function toContent(blocks: DocumentBlock[]) {
  return {
    type: 'doc',
    content: blocks.map((block) => {
      const pieces: { type: 'text'; text: string; marks?: { type: string; attrs?: object }[] }[] = []
      let cursor = 0
      const plain = (end: number) => {
        if (end > cursor) pieces.push({ type: 'text', text: block.text.slice(cursor, end) })
      }
      for (const span of [...block.spans].sort((a, b) => a.start - b.start)) {
        if (span.end <= span.start || span.start < cursor) continue
        plain(span.start)
        const marks = [
          ...(span.weight !== undefined ? [{ type: 'weight', attrs: { weight: span.weight } }] : []),
          ...(span.italic ? [{ type: 'italic' }] : []),
        ]
        pieces.push({ type: 'text', text: block.text.slice(span.start, span.end), marks })
        cursor = span.end
      }
      plain(block.text.length)
      return {
        type: block.kind,
        attrs: {
          ...(block.kind === 'heading' ? { level: block.level ?? 1 } : {}),
          leading: block.leading ?? null,
          tracking: block.tracking ?? null,
        },
        content: pieces.length ? pieces : undefined,
      }
    }),
  }
}

/** Where block `index`'s text starts in the document. */
function blockStart(doc: ProseMirrorNode, index: number) {
  let position = 1
  for (let i = 0; i < index && i < doc.childCount; i++) position += doc.child(i).nodeSize
  return position
}

/** A lettra caret point as a ProseMirror position. */
export function toPosition(doc: ProseMirrorNode, { block, offset }: TextPoint) {
  const index = Math.max(0, Math.min(block, doc.childCount - 1))
  return blockStart(doc, index) + Math.max(0, Math.min(offset, doc.child(index).content.size))
}

/** A ProseMirror position as a lettra caret point. */
export function toPoint(doc: ProseMirrorNode, position: number): TextPoint {
  let start = 1
  for (let block = 0; block < doc.childCount; block++) {
    const size = doc.child(block).content.size
    if (position <= start + size || block === doc.childCount - 1)
      return { block, offset: Math.max(0, Math.min(position - start, size)) }
    start += size + 2
  }
  return { block: 0, offset: 0 }
}

export function toSelection(editor: Editor): TextSelection {
  const { doc, selection } = editor.state
  return { anchor: toPoint(doc, selection.anchor), head: toPoint(doc, selection.head) }
}

export function selectPoints(editor: Editor, anchor: TextPoint, head: TextPoint = anchor) {
  const { doc } = editor.state
  editor.view.dispatch(
    editor.state.tr.setSelection(ProseMirrorTextSelection.create(doc, toPosition(doc, anchor), toPosition(doc, head)))
  )
}
