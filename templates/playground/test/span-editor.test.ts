import { describe, expect, it } from 'vitest'
import { spansToHtml } from '@/components/span-editor'
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
