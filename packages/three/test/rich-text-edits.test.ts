import { describe, expect, it } from 'vitest'
import { Texture } from 'three/webgpu'
import { createRichText, defineFamily } from '../index'
import type { RichSpan } from '../index'
import type { MSDFFont } from '../../core/types'

/* An editor hands setText a new (text, spans) pair per keystroke. These are
 * the two rules that keep the pair valid — clip to the text, and let a new
 * span evict what it overlaps — run against a long stream of edits. */
const clipSpans = (spans: RichSpan[], length: number): RichSpan[] =>
  spans.filter((s) => s.start < length).map((s) => (s.end > length ? { ...s, end: length } : s))

const addSpan = (spans: RichSpan[], next: RichSpan): RichSpan[] =>
  [...spans.filter((s) => s.end <= next.start || s.start >= next.end), next].sort((a, b) => a.start - b.start)

const chars = ' abcdefghijklmnopqrstuvwxyz'
const glyphs = Object.fromEntries([...chars].map((c) => [c, [0, 0, 30, 60, 0, 4, 34]]))
const font = (name: string): MSDFFont => ({
  name,
  size: 64,
  lineHeight: 77,
  base: 62,
  distanceRange: 8,
  atlas: { width: 1024, height: 1024 },
  glyphs: glyphs as MSDFFont['glyphs'],
  kerning: {},
})

describe('span editor invariants', () => {
  it('never produces a span set createRichText rejects', async () => {
    const family = defineFamily({
      src: [
        { json: '/400', atlas: '/400p', weight: 400 },
        { json: '/700', atlas: '/700p', weight: 700 },
        { json: '/400i', atlas: '/400ip', weight: 400, style: 'italic' },
      ],
      loaders: { font: (url) => Promise.resolve(font(url)), texture: () => Promise.resolve(new Texture()) },
    })
    await family.loadAll()

    let text = chars.repeat(3)
    let spans: RichSpan[] = []
    const rich = createRichText({ family, text, spans, layout: { maxWidth: 900 } })

    // deterministic pseudo-random edit stream: add spans, retype, truncate
    let seed = 7
    const next = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n

    for (let step = 0; step < 400; step++) {
      const roll = next(3)
      if (roll === 0 && text.length > 1) {
        const start = next(text.length - 1)
        const end = start + 1 + next(text.length - start - 1)
        spans = addSpan(spans, { start, end, weight: next(2) === 0 ? 700 : 400 })
      } else if (roll === 1) {
        text = text.slice(0, Math.max(0, next(text.length + 1)))
        spans = clipSpans(spans, text.length)
      } else {
        text = text + chars.slice(0, 1 + next(10))
      }
      expect(() => rich.setText(text, spans, { maxWidth: 900 })).not.toThrow()
    }
    rich.dispose()
  })
})
