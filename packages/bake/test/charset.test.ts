import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CHARSET_PRESETS, partitionByCoverage, resolveCharset } from '../charset'

describe('resolveCharset', () => {
  it('resolves preset names', () => {
    expect(resolveCharset('latin-es')).toContain('ñ')
    expect(resolveCharset('latin-es')).toContain('¿')
    expect(resolveCharset('ascii')).not.toContain('ñ')
    for (const preset of Object.values(CHARSET_PRESETS)) {
      expect(preset).toContain(' ')
      expect(preset).toContain('?')
    }
  })

  it('reads a file path and falls back to a literal string', () => {
    const file = join(tmpdir(), `lettra-charset-${Date.now()}.txt`)
    writeFileSync(file, 'AB\nCD\r\n')
    expect(resolveCharset(file)).toBe('ABCD')
    expect(resolveCharset('xyz')).toBe('xyz')
  })

  it('strips duplicates so the atlas never bakes a glyph twice', () => {
    expect(resolveCharset('aabbcc')).toBe('abc')
  })
})

describe('partitionByCoverage', () => {
  it('splits mappable characters from ones that would bake as tofu', () => {
    const covered = new Set(['A', 'B'].map((c) => c.codePointAt(0)!))
    const { usable, missing } = partitionByCoverage('AB漢', covered)
    expect(usable).toBe('AB')
    expect(missing).toEqual(['漢'])
  })

  it('drops control characters without reporting them missing', () => {
    const covered = new Set(['A'].map((c) => c.codePointAt(0)!))
    expect(partitionByCoverage('A\n\t', covered)).toEqual({ usable: 'A', missing: [] })
  })
})
