import { describe, expect, it } from 'vitest'
import { caretLayout, hitTest, lineEdge, nearestOnLine, sentenceAt, verticalMove, wordAt } from '../caret'
import { parseFont } from '../parse'
import { layoutRuns } from '../runs'
import type { LayoutRun } from '../runs'
import type { LayoutOptions, MSDFFont } from '../types'
import miniFont from './fixtures/mini-font.json'

/* mini-font: size 10, lineHeight 12, base 9. Advances: H=10 A=9 V=9 a=7 v=7
 * space=5 m=10 .=4. Kerning: AV=-4 Va=-2 av=-1. Every xoffset is 0, so a
 * placed quad's x is exactly the pen x the caret should stand at. */
const mini = parseFont(miniFont)

/* mini baked at 2×: lays out identically after normalization. */
const big: MSDFFont = {
  ...mini,
  name: 'big',
  size: 20,
  lineHeight: 24,
  base: 18,
  glyphs: Object.fromEntries(
    Object.entries(mini.glyphs).map(([char, [x, y, w, h, xo, yo, adv]]) => [
      char,
      [x, y, w * 2, h * 2, xo * 2, yo * 2, adv * 2],
    ])
  ) as MSDFFont['glyphs'],
  kerning: Object.fromEntries(Object.entries(mini.kerning).map(([pair, k]) => [pair, k * 2])),
}

const single = (text: string): LayoutRun[] => [{ font: mini, start: 0, end: text.length }]

/** Every glyph the layout draws sits where the caret before it stands. */
function expectStopsMatchGlyphs(text: string, runs: LayoutRun[], opts: LayoutOptions) {
  const drawn = layoutRuns(text, runs, opts)
  const caret = caretLayout(text, runs, opts)
  expect(caret.stops).toHaveLength(text.length + 1)
  for (const glyph of drawn.glyphs) {
    expect(caret.stops[glyph.index].x).toBeCloseTo(glyph.x, 6)
    expect(caret.stops[glyph.index].line).toBe(glyph.line)
  }
  expect(caret.lines).toHaveLength(Math.max(1, drawn.metrics.lineCount))
  expect(caret.lineHeight).toBe(drawn.metrics.lineHeight)
  expect(caret.baseline).toBe(drawn.metrics.baseline)
  return caret
}

describe('caretLayout', () => {
  const text = 'HAVa vAV mHa. VAv aHa VV'

  it.each<LayoutOptions>([
    {},
    { maxWidth: 60 },
    { maxWidth: 60, align: 'center' },
    { maxWidth: 60, align: 'right' },
    { maxWidth: 45, letterSpacing: 2 },
    { lineHeight: 20, maxWidth: 50 },
  ])('agrees with layoutRuns on every glyph (%o)', (opts) => {
    expectStopsMatchGlyphs(text, single(text), opts)
  })

  it('agrees across mixed runs and bake sizes, with kerning dropped at boundaries', () => {
    const runs: LayoutRun[] = [
      { font: mini, start: 0, end: 3 },
      { font: big, start: 3, end: 10 },
      { font: mini, start: 10, end: text.length },
    ]
    expectStopsMatchGlyphs(text, runs, { maxWidth: 70 })
    // the AV pair straddles a run boundary, so it doesn't kern: V stands at A's full advance
    const caret = caretLayout('AV', [
      { font: mini, start: 0, end: 1 },
      { font: big, start: 1, end: 2 },
    ])
    expect(caret.stops[1].x).toBe(9)
  })

  it('kerns inside one run', () => {
    expect(caretLayout('AV', single('AV')).stops[1].x).toBe(5)
  })

  it('walks tabs and newlines like the drawing pen', () => {
    const tabbed = 'Ha\tvA\nVa'
    const caret = expectStopsMatchGlyphs(tabbed, single(tabbed), { mode: 'pre' })
    // a tab is 4 spaces wide
    expect(caret.stops[3].x - caret.stops[2].x).toBe(20)
    expect(caret.stops[6].line).toBe(1)
    expect(caret.stops[6].x).toBe(0)
  })

  it('ends with a stop after the last character', () => {
    const caret = caretLayout('Ha', single('Ha'))
    expect(caret.stops[2]).toEqual({ x: 17, line: 0 })
  })

  it('gives empty text one line and one stop', () => {
    const caret = caretLayout('', [{ font: mini, start: 0, end: 0 }])
    expect(caret.lines).toEqual([{ start: 0, end: 0, from: 0, to: 0 }])
    expect(caret.stops).toEqual([{ x: 0, line: 0 }])
  })

  it('keeps a wrapped line’s trimmed spaces on it, and starts the next at its own first character', () => {
    const wrapped = 'Ha vA'
    const caret = caretLayout(wrapped, single(wrapped), { maxWidth: 20 })
    expect(caret.lines).toHaveLength(2)
    const [first, second] = caret.lines
    expect(first.to).toBe(second.start - 1)
    expect(second.from).toBe(second.start)
    // the trimmed space's offset is on the first line, at its end
    expect(caret.stops[first.to].line).toBe(0)
    expect(caret.stops[second.start]).toEqual({ x: 0, line: 1 })
  })

  it('reports the fonts’ own line box as reach, whatever the line height', () => {
    expect(caretLayout('Ha', single('Ha'), { lineHeight: 6 }).reach).toBe(12)
  })
})

describe('caret navigation', () => {
  const text = 'Ha vA HH aa'
  const caret = caretLayout(text, single(text), { maxWidth: 30 })

  it('hit-tests to the nearest stop on the line under the point', () => {
    expect(hitTest(caret, -50, -50)).toBe(0)
    expect(hitTest(caret, 9, 1)).toBe(1)
    const last = caret.lines.length - 1
    expect(caret.stops[hitTest(caret, 1000, 1000)].line).toBe(last)
    expect(hitTest(caret, 1000, 1000)).toBe(text.length)
  })

  it('finds the nearest offset on a line', () => {
    const line = caret.lines[1]
    expect(nearestOnLine(caret, 1, 0)).toBe(line.from)
  })

  it('moves vertically keeping the goal x, and leaves the text past its first or last line', () => {
    expect(verticalMove(caret, 0, -1, 0)).toBeUndefined()
    const down = verticalMove(caret, 1, 1, caret.stops[1].x)
    expect(down).toBeDefined()
    expect(caret.stops[down!].line).toBe(1)
    expect(verticalMove(caret, text.length, 1, 0)).toBeUndefined()
  })

  it('finds a line’s edges', () => {
    const line = caret.lines[1]
    expect(lineEdge(caret, line.start + 1, 'start')).toBe(line.from)
    expect(lineEdge(caret, line.start + 1, 'end')).toBe(Math.min(line.end, line.to))
  })
})

describe('wordAt and sentenceAt', () => {
  it('takes the word around an offset, apostrophes included', () => {
    const text = "the pond's edge"
    expect(wordAt(text, 6)).toEqual([4, 10])
    expect(wordAt(text, 4)).toEqual([4, 10])
    expect(wordAt('a  b', 2)).toEqual([2, 2])
  })

  it('takes the sentence around an offset, without the spaces after its stop', () => {
    const text = 'One. Two and three! Four'
    expect(sentenceAt(text, 1)).toEqual([0, 4])
    expect(sentenceAt(text, 8)).toEqual([5, 19])
    expect(sentenceAt(text, 22)).toEqual([20, 24])
  })
})
