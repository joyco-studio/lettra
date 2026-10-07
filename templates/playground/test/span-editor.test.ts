import { describe, expect, it } from 'vitest'
import { spansToHtml } from '@/components/span-editor'
import { RICH_TEXT, SPAN_PRESETS } from '@/gl/views/rich-text'

describe('spansToHtml', () => {
  it('nests a weight around an italic and leaves the gaps alone', () => {
    expect(spansToHtml('abcdef', [{ start: 2, end: 4, weight: 700, style: 'italic' }])).toBe(
      '<p>ab<span data-weight="700"><em>cd</em></span>ef</p>'
    )
  })

  it('escapes markup in the text', () => {
    expect(spansToHtml('a <b> & "c"', [])).toBe('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>')
  })

  it('seeds every preset without dropping or duplicating a character', () => {
    for (const preset of SPAN_PRESETS) {
      const html = spansToHtml(RICH_TEXT, preset.spans)
      const text = html
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
      expect(text).toBe(RICH_TEXT)
    }
  })
})
