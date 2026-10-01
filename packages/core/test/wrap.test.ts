import { describe, expect, it } from 'vitest'
import { wrapLines } from '../wrap'

const text = (source: string, lines: { start: number; end: number }[]) =>
  lines.map((line) => source.substring(line.start, line.end))

describe('wrapLines', () => {
  it('breaks greedily at the last whitespace that fits', () => {
    const source = 'the quick brown fox'
    const lines = wrapLines(source, { width: 9 })
    expect(text(source, lines)).toEqual(['the quick', 'brown fox'])
  })

  it('eats leading and trailing whitespace around breaks', () => {
    const source = 'aa   bb'
    const lines = wrapLines(source, { width: 3 })
    expect(text(source, lines)).toEqual(['aa', 'bb'])
  })

  it('hard-breaks a word wider than the line', () => {
    const source = 'abcdefgh'
    const lines = wrapLines(source, { width: 3 })
    expect(text(source, lines)).toEqual(['abc', 'def', 'gh'])
  })

  it('pre mode splits on newlines only', () => {
    const source = 'one two\nthree'
    const lines = wrapLines(source, { mode: 'pre' })
    expect(text(source, lines)).toEqual(['one two', 'three'])
  })

  it('nowrap ignores width but still honors newlines', () => {
    const source = 'one two\nthree'
    const lines = wrapLines(source, { width: 2, mode: 'nowrap' })
    expect(text(source, lines)).toEqual(['one two', 'three'])
  })

  it('returns no lines for empty text', () => {
    expect(wrapLines('', { width: 10 })).toEqual([])
  })

  it('returns no lines for zero width unless nowrap', () => {
    expect(wrapLines('abc', { width: 0 })).toEqual([])
    expect(text('abc', wrapLines('abc', { width: 0, mode: 'nowrap' }))).toEqual(['abc'])
  })
})
