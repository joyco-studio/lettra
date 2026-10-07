import { describe, expect, it } from 'vitest'
import { readCmapCoverage, readTableTags, readTables, readWeightClass, isVariableFont, hasKerningTables } from '../sfnt'

describe('sfnt preflight', () => {
  const sfnt = (tags: string[]): Uint8Array => {
    const data = new Uint8Array(12 + tags.length * 16)
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, tags.length)
    tags.forEach((tag, i) => {
      for (let c = 0; c < 4; c++) data[12 + i * 16 + c] = tag.charCodeAt(c)
    })
    return data
  }

  it('reads table tags and classifies fonts', () => {
    const tags = readTableTags(sfnt(['glyf', 'fvar', 'GPOS']))
    expect(tags).toEqual(['glyf', 'fvar', 'GPOS'])
    expect(isVariableFont(tags)).toBe(true)
    expect(hasKerningTables(tags)).toBe(true)
    expect(hasKerningTables(['glyf', 'kern'])).toBe(true)
    expect(isVariableFont(['glyf'])).toBe(false)
  })

  it('reads usWeightClass so static faces self-report their weight', () => {
    const data = new Uint8Array(28 + 6)
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, 1)
    for (let c = 0; c < 4; c++) data[12 + c] = 'OS/2'.charCodeAt(c)
    view.setUint32(12 + 8, 28)
    view.setUint16(28 + 4, 700)
    expect(readWeightClass(data, readTables(data))).toBe(700)
    expect(readWeightClass(data, readTables(sfnt(['glyf'])))).toBeNull()
  })

  it('reads cmap coverage from a format 4 subtable', () => {
    // one cmap subtable (3,1) format 4 with a single A-C segment plus the
    // required 0xFFFF terminator
    // sfnt header + one table entry + cmap header + record + format 4 body
    const data = new Uint8Array(12 + 16 + 12 + (16 + 8 * 2))
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, 1)
    for (let c = 0; c < 4; c++) data[12 + c] = 'cmap'.charCodeAt(c)
    const cmap = 28
    view.setUint32(12 + 8, cmap)
    view.setUint16(cmap + 2, 1)
    view.setUint16(cmap + 4, 3)
    view.setUint16(cmap + 6, 1)
    view.setUint32(cmap + 8, 12) // subtable sits past the 12-byte header+record
    const sub = cmap + 12
    view.setUint16(sub, 4)
    view.setUint16(sub + 6, 4) // segCountX2 → 2 segments
    view.setUint16(sub + 14, 0x43) // end[0] = C
    view.setUint16(sub + 16, 0xffff) // end[1]
    view.setUint16(sub + 20, 0x41) // start[0] = A
    view.setUint16(sub + 22, 0xffff) // start[1]
    view.setUint16(sub + 24, 1) // idDelta[0]

    const covered = readCmapCoverage(data, readTables(data), [0x40, 0x41, 0x42, 0x43, 0x44])
    expect([...covered!].sort()).toEqual([0x41, 0x42, 0x43])
  })

  it('reads cmap coverage from a format 12 group based at glyph 0', () => {
    // sfnt header + one table entry + cmap header + record + format 12 body
    const data = new Uint8Array(12 + 16 + 12 + 16 + 12)
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, 1)
    for (let c = 0; c < 4; c++) data[12 + c] = 'cmap'.charCodeAt(c)
    const cmap = 28
    view.setUint32(12 + 8, cmap)
    view.setUint16(cmap + 2, 1)
    view.setUint16(cmap + 4, 3)
    view.setUint16(cmap + 6, 10)
    view.setUint32(cmap + 8, 12)
    const sub = cmap + 12
    view.setUint16(sub, 12)
    view.setUint32(sub + 12, 1) // one group
    view.setUint32(sub + 16, 0x41) // start = A
    view.setUint32(sub + 20, 0x43) // end = C
    view.setUint32(sub + 24, 0) // startGlyphID = 0 → only A is unmapped

    const covered = readCmapCoverage(data, readTables(data), [0x41, 0x42, 0x43, 0x44])
    expect([...covered!].sort()).toEqual([0x42, 0x43])
  })

  it('ignores a declared range far wider than the charset', () => {
    const data = new Uint8Array(12 + 16 + 12 + 16 + 12)
    const view = new DataView(data.buffer)
    view.setUint32(0, 0x00010000)
    view.setUint16(4, 1)
    for (let c = 0; c < 4; c++) data[12 + c] = 'cmap'.charCodeAt(c)
    const cmap = 28
    view.setUint32(12 + 8, cmap)
    view.setUint16(cmap + 2, 1)
    view.setUint16(cmap + 4, 3)
    view.setUint16(cmap + 6, 10)
    view.setUint32(cmap + 8, 12)
    const sub = cmap + 12
    view.setUint16(sub, 12)
    view.setUint32(sub + 12, 1)
    view.setUint32(sub + 16, 0)
    view.setUint32(sub + 20, 0xffffffff) // malformed: the whole 32-bit space
    view.setUint32(sub + 24, 1)

    const started = Date.now()
    expect([...readCmapCoverage(data, readTables(data), [0x41])!]).toEqual([0x41])
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('reports unknown coverage as null, not as an empty set', () => {
    expect(readCmapCoverage(sfnt(['glyf']), readTables(sfnt(['glyf'])), [0x41])).toBeNull()
  })

  it('rejects collections and non-fonts', () => {
    const ttc = new Uint8Array(12)
    new DataView(ttc.buffer).setUint32(0, 0x74746366)
    expect(() => readTableTags(ttc)).toThrow(/collections/)
    expect(() => readTableTags(new Uint8Array([1, 2, 3]))).toThrow(/too short/)
    const junk = new Uint8Array(12)
    new DataView(junk.buffer).setUint32(0, 0xdeadbeef)
    expect(() => readTableTags(junk)).toThrow(/sfnt magic/)
  })
})
