/* Minimal sfnt table-directory reader: enough to preflight a font without a
 * shaping dependency. */

function fail(message: string): never {
  throw new Error(`[lettra-bake] ${message}`)
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

/** OS/2 usWeightClass, so static faces are labelled by their real weight
 * instead of a default. Null when the table is missing or malformed. */
export function readWeightClass(data: Uint8Array, tables: SfntTables): number | null {
  const offset = tables.offsets.get('OS/2')
  if (offset === undefined || offset + 6 > data.byteLength) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const weight = view.getUint16(offset + 4)
  return weight >= 1 && weight <= 1000 ? weight : null
}
