'use client'

import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Italic from '@tiptap/extension-italic'
import { Extension } from '@tiptap/core'
import type { RichSpan } from 'lettra/three'
import { FIELD_TEXT, FieldLabel, Segment } from '@/components/layout'

/** 200, 400 and 700 are baked; 500 is not, and serves 400. 400 clears the
 * mark rather than setting one, since it is what the base variant already is. */
export const EDITOR_WEIGHTS = [200, 400, 500, 700]

/** A weight run. One mark type, so setting a second weight over a range
 * replaces the first instead of nesting — the same thing `spans` means. */
const Weight = Mark.create({
  name: 'weight',
  addAttributes() {
    return {
      weight: {
        default: 700,
        parseHTML: (element) => Number(element.getAttribute('data-weight')) || 700,
        renderHTML: (attributes) => ({ 'data-weight': String(attributes.weight) }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-weight]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})

/** One paragraph, always: lettra wraps the measure itself, and a second block
 * would mean a newline the spans would have to step over. */
const SingleParagraph = Extension.create({
  name: 'singleParagraph',
  addKeyboardShortcuts() {
    return {
      Enter: () => true,
      'Mod-b': () => this.editor.chain().focus().setMark('weight', { weight: 700 }).run(),
      'Mod-i': () => this.editor.chain().focus().toggleItalic().run(),
    }
  },
})

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Spans back to markup, for seeding the editor from a preset. */
export function spansToHtml(text: string, spans: RichSpan[]): string {
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  let html = ''
  let cursor = 0
  for (const span of ordered) {
    if (span.start > cursor) html += escapeHtml(text.slice(cursor, span.start))
    let inner = escapeHtml(text.slice(span.start, span.end))
    if (span.style === 'italic') inner = `<em>${inner}</em>`
    if (span.weight !== undefined) inner = `<span data-weight="${span.weight}">${inner}</span>`
    html += inner
    cursor = span.end
  }
  html += escapeHtml(text.slice(cursor))
  return `<p>${html}</p>`
}

/** The editor's document as lettra sees it: the flat string plus one span per
 * styled run. ProseMirror already splits text nodes at every mark boundary, so
 * the runs come out sorted and disjoint, which is exactly what
 * `createRichText` asks for. */
function read(editor: Editor): { text: string; spans: RichSpan[] } {
  let text = ''
  const spans: RichSpan[] = []
  editor.state.doc.descendants((node) => {
    if (!node.isText) return
    const start = text.length
    text += node.text ?? ''
    const weight = node.marks.find((mark) => mark.type.name === 'weight')?.attrs.weight as number | undefined
    const italic = node.marks.some((mark) => mark.type.name === 'italic')
    if (weight === undefined && !italic) return
    const span: RichSpan = { start, end: text.length }
    if (weight !== undefined) span.weight = weight
    if (italic) span.style = 'italic'
    const previous = spans[spans.length - 1]
    // a split node with identical marks is one span, not two
    if (previous && previous.end === start && previous.weight === span.weight && previous.style === span.style) {
      previous.end = span.end
      return
    }
    spans.push(span)
  })
  return { text, spans }
}

export interface SpanEditorProps {
  /** Seeds the document once. Later changes come from the editor, and a
   * preset reseeds it through `onReady`'s editor. */
  defaultText: string
  defaultSpans: RichSpan[]
  onChange(value: { text: string; spans: RichSpan[] }): void
}

/** Rich-text input for the spans figure: type, select, and set a weight or an
 * italic on the selection. What comes out is the `{ text, spans }` pair
 * `createRichText` takes. */
export function SpanEditor({ defaultText, defaultSpans, onChange }: SpanEditorProps) {
  const editor = useEditor({
    // Next renders this on the server first; Tiptap has to wait for the DOM
    immediatelyRender: false,
    extensions: [Document.extend({ content: 'paragraph' }), Paragraph, Text, Italic, Weight, SingleParagraph],
    content: spansToHtml(defaultText, defaultSpans),
    editorProps: {
      attributes: {
        class: `${FIELD_TEXT} min-h-[4.5rem] outline-none [&_[data-weight="200"]]:font-light [&_[data-weight="500"]]:font-medium [&_[data-weight="700"]]:font-bold [&_em]:italic`,
      },
    },
    onUpdate: ({ editor: instance }) => onChange(read(instance)),
  })

  // useEditor alone does not re-render per transaction in v3, so the toolbar
  // subscribes to just the two things it paints
  const marks = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      weight: instance?.isActive('weight') ? (instance.getAttributes('weight').weight as number) : undefined,
      italic: instance?.isActive('italic') ?? false,
    }),
  })

  return (
    <div className="bg-paper px-3 pt-2 pb-2.5">
      <FieldLabel>rich text</FieldLabel>
      <div className="min-w-0">
        <EditorContent editor={editor} />
        {editor ? (
          <BubbleMenu editor={editor} className="flex bg-[#dcdcda] p-[2px] shadow-md">
            <div className="flex h-9 items-center gap-1 bg-paper px-2">
              <span className="pr-1 font-mono text-[10px] font-medium tracking-[0.02em] text-ink-faint">weight</span>
              {EDITOR_WEIGHTS.map((weight) => (
                <Segment
                  key={weight}
                  title={weight === 400 ? 'weight 400 (the base variant)' : `weight ${weight}`}
                  active={(marks?.weight ?? 400) === weight}
                  onClick={() =>
                    weight === 400
                      ? editor.chain().focus().unsetMark('weight').run()
                      : editor.chain().focus().setMark('weight', { weight }).run()
                  }
                >
                  {weight}
                </Segment>
              ))}
            </div>
            <div className="ml-[2px] flex h-9 items-center bg-paper px-2">
              <Segment
                title="italic"
                active={marks?.italic ?? false}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <span className="font-serif text-[13px] italic">i</span>
              </Segment>
            </div>
          </BubbleMenu>
        ) : null}
      </div>
    </div>
  )
}
