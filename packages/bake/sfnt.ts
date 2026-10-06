/* Minimal sfnt table-directory reader: enough to preflight a font without a
 * shaping dependency. */

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

export interface SfntTables {
  tags: string[]
  offsets: Map<string, number>
}

export function readTables(data: Uint8Array): SfntTables {
  if (data.byteLength < 12) fail('not a font file (too short for an sfnt header)')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const magic = view.getUint32(0)
  if (magic === 0x74746366) fail('font collections (.ttc) are not supported; extract a single face first')
  if (magic !== 0x00010000 && magic !== 0x4f54544f && magic !== 0x74727565) {
    fail('not a TTF/OTF font (unknown sfnt magic)')
  }
  const numTables = view.getUint16(4)
  if (data.byteLength < 12 + numTables * 16) fail('truncated sfnt table directory')

  const tags: string[] = []
  const offsets = new Map<string, number>()
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16
    const tag = String.fromCharCode(data[entry], data[entry + 1], data[entry + 2], data[entry + 3])
    tags.push(tag)
    offsets.set(tag, view.getUint32(entry + 8))
  }
  return { tags, offsets }
}

export function readTableTags(data: Uint8Array): string[] {
  return readTables(data).tags
}

export function isVariableFont(tags: string[]): boolean {
  return tags.includes('fvar')
}

/** Kerning lives in GPOS (modern) or the legacy kern table. */
export function hasKerningTables(tags: string[]): boolean {
  return tags.includes('GPOS') || tags.includes('kern')
}

/** Which of `wanted` the font maps to a glyph; anything outside the result
 * bakes as .notdef tofu, so the CLI drops it and says so. Null means the cmap
 * is unreadable, i.e. coverage unknown rather than empty. Scoped to `wanted`
 * because format 12 endpoints are unbounded 32-bit values. */
export function readCmapCoverage(data: Uint8Array, tables: SfntTables, wanted: Iterable<number>): Set<number> | null {
  const want = wanted instanceof Set ? wanted : new Set(wanted)
  const covered = new Set<number>()
  const cmap = tables.offsets.get('cmap')
  if (cmap === undefined || cmap + 4 > data.byteLength) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // prefer full-repertoire (3,10) over BMP (3,1), then any Unicode subtable
  let best = -1
  let bestScore = -1
  const count = view.getUint16(cmap + 2)
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8
    if (record + 8 > data.byteLength) break
    const platform = view.getUint16(record)
    const encoding = view.getUint16(record + 2)
    const score = platform === 3 && encoding === 10 ? 3 : platform === 3 && encoding === 1 ? 2 : platform === 0 ? 1 : 0
    if (score > bestScore) {
      bestScore = score
      best = cmap + view.getUint32(record + 4)
    }
  }
  if (best < 0 || best + 4 > data.byteLength) return null

  const format = view.getUint16(best)
  if (format === 4) {
    const segCount = view.getUint16(best + 6) / 2
    const ends = best + 14
    const starts = ends + segCount * 2 + 2
    const deltas = starts + segCount * 2
    const rangeOffsets = deltas + segCount * 2
    for (let s = 0; s < segCount; s++) {
      if (rangeOffsets + s * 2 + 2 > data.byteLength) break
      const end = view.getUint16(ends + s * 2)
      const start = view.getUint16(starts + s * 2)
      if (start > end || start === 0xffff) continue
      const delta = view.getUint16(deltas + s * 2)
      const rangeOffset = view.getUint16(rangeOffsets + s * 2)
      for (const code of want) {
        if (code < start || code > end) continue
        let glyph: number
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff
        } else {
          const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2
          if (at + 2 > data.byteLength) continue
          const raw = view.getUint16(at)
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
        }
        if (glyph !== 0) covered.add(code)
      }
    }
  } else if (format === 12) {
    const groups = view.getUint32(best + 12)
    for (let g = 0; g < groups; g++) {
      const at = best + 16 + g * 12
      if (at + 12 > data.byteLength) break
      const start = view.getUint32(at)
      const end = view.getUint32(at + 4)
      const startGlyph = view.getUint32(at + 8)
      if (end < start) continue
      // glyph ids climb with the code, so a group based at glyph 0 only leaves
      // its own first code point unmapped — the rest are real glyphs
      const from = startGlyph === 0 ? start + 1 : start
      for (const code of want) {
        if (code >= from && code <= end) covered.add(code)
      }
    }
  } else {
    return null
  }
  return covered
}

/** OS/2 usWeightClass, so static faces are labelled by their real weight
 * instead of a default. Null when the table is missing or malformed. */
export function readWeightClass(data: Uint8Array, tables: SfntTables): number | null {
  const offset = tables.offsets.get('OS/2')
  if (offset === undefined || offset + 6 > data.byteLength) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const weight = view.getUint16(offset + 4)
  return weight >= 1 && weight <= 1000 ? weight : null
}

/** Whether the face reports itself italic: OS/2 fsSelection bit 0, or a
 * non-zero post italicAngle. Null when neither table is readable, so callers
 * can tell "upright" from "unknown". */
export function isItalicFont(data: Uint8Array, tables: SfntTables): boolean | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const os2 = tables.offsets.get('OS/2')
  // fsSelection sits at offset 62 in every OS/2 version
  if (os2 !== undefined && os2 + 64 <= data.byteLength) {
    if ((view.getUint16(os2 + 62) & 0x01) !== 0) return true
  }
  const post = tables.offsets.get('post')
  // italicAngle is a 16.16 fixed at offset 4
  if (post !== undefined && post + 8 <= data.byteLength) {
    if (view.getInt32(post + 4) !== 0) return true
  }
  if (os2 === undefined && post === undefined) return null
  return false
}

/** fvar axis tags, so a variable face can be checked for `wght` before any
 * atlas is written. Empty for a static font; null when fvar is unreadable. */
export function readVariationAxes(data: Uint8Array, tables: SfntTables): string[] | null {
  const offset = tables.offsets.get('fvar')
  if (offset === undefined) return []
  if (offset + 16 > data.byteLength) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const axesOffset = offset + view.getUint16(offset + 4)
  const axisCount = view.getUint16(offset + 8)
  const axisSize = view.getUint16(offset + 10)
  // an axis record is 20 bytes; a smaller stride means a malformed table
  if (axisSize < 20 || axesOffset + axisCount * axisSize > data.byteLength) return null
  const tags: string[] = []
  for (let i = 0; i < axisCount; i++) {
    const at = axesOffset + i * axisSize
    tags.push(String.fromCharCode(data[at], data[at + 1], data[at + 2], data[at + 3]))
  }
  return tags
}
