import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import type { Mark, Node as PMNode } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { EDITOR_EXTENSIONS, readDoc, spansToHtml } from '@/components/span-editor'
import { RICH_SPANS, RICH_TEXT } from '@/gl/views/rich-text'

describe('spansToHtml', () => {
  it('nests a weight around an italic and leaves the gaps alone', () => {
    expect(spansToHtml('abcdef', [{ start: 2, end: 4, weight: 700, style: 'italic' }])).toBe(
      '<p>ab<span data-weight="700"><em>cd</em></span>ef</p>'
    )
  })

  it('escapes markup in the text', () => {
    expect(spansToHtml('a <b> & "c"', [])).toBe('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>')
  })

  it('seeds the figure without dropping or duplicating a character', () => {
    const html = spansToHtml(RICH_TEXT, RICH_SPANS)
    const text = html
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
    expect(text).toBe(RICH_TEXT)
    expect(html).toContain('data-weight="700"')
    expect(html).toContain('<em>')
  })
})

describe('hard breaks', () => {
  it('seeds a newline as a break and keeps the span offsets around it', () => {
    expect(spansToHtml('ab\ncd', [{ start: 3, end: 5, weight: 700 }])).toBe(
      '<p>ab<br><span data-weight="700">cd</span></p>'
    )
  })
})

describe('readDoc', () => {
  const schema = getSchema(EDITOR_EXTENSIONS)
  const bold = (weight = 700) => schema.marks.weight.create({ weight })
  const italic = () => schema.marks.italic.create()
  const doc = (...children: PMNode[]) => schema.node('doc', null, [schema.node('paragraph', null, children)])
  const text = (value: string, marks: Mark[] = []) => schema.text(value, marks)
  const br = () => schema.node('hardBreak')

  it('reads a weight and an italic on one run as one span', () => {
    expect(readDoc(doc(text('ab'), text('cd', [bold(), italic()]), text('ef')))).toEqual({
      text: 'abcdef',
      spans: [{ start: 2, end: 4, weight: 700, style: 'italic' }],
    })
  })

  it('keeps adjacent runs with different marks apart', () => {
    expect(readDoc(doc(text('ab', [bold()]), text('cd', [bold(200)]), text('ef', [italic()])))).toEqual({
      text: 'abcdef',
      spans: [
        { start: 0, end: 2, weight: 700 },
        { start: 2, end: 4, weight: 200 },
        { start: 4, end: 6, style: 'italic' },
      ],
    })
  })

  it('counts a hard break as a newline that starts no span', () => {
    expect(readDoc(doc(text('ab', [bold()]), br(), text('cd', [bold()])))).toEqual({
      text: 'ab\ncd',
      spans: [
        { start: 0, end: 2, weight: 700 },
        { start: 3, end: 5, weight: 700 },
      ],
    })
  })

  it('merges the halves of a run once the text between them is deleted', () => {
    const before = doc(text('ab', [bold()]), text('XY'), text('cd', [bold()]))
    // positions are 1-based inside the paragraph: "XY" sits at 3..5
    const after = EditorState.create({ doc: before }).tr.delete(3, 5).doc
    expect(readDoc(after)).toEqual({ text: 'abcd', spans: [{ start: 0, end: 4, weight: 700 }] })
  })

  it('drops a span whose styled text is deleted', () => {
    const before = doc(text('ab'), text('cd', [italic()]), text('ef'))
    const after = EditorState.create({ doc: before }).tr.delete(3, 5).doc
    expect(readDoc(after)).toEqual({ text: 'abef', spans: [] })
  })
})
