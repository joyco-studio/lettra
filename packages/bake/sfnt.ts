/* Minimal sfnt table-directory reader — enough to preflight a font without a
 * shaping dependency: is it variable (fvar)? does it kern (GPOS/kern)? */

function fail(message: string): never {
  throw new Error(`[lettra-bake] ${message}`)
}

/** Reads the sfnt table tags of a TTF/OTF buffer. */
export function readTableTags(data: Uint8Array): string[] {
  if (data.byteLength < 12) fail('not a font file (too short for an sfnt header)')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const magic = view.getUint32(0)
  if (magic === 0x74746366) {
    fail('font collections (.ttc) are not supported; extract a single face first')
  }
  if (magic !== 0x00010000 && magic !== 0x4f54544f && magic !== 0x74727565) {
    fail('not a TTF/OTF font (unknown sfnt magic)')
  }
  const numTables = view.getUint16(4)
  if (data.byteLength < 12 + numTables * 16) fail('truncated sfnt table directory')
  const tags: string[] = []
  for (let i = 0; i < numTables; i++) {
    const offset = 12 + i * 16
    tags.push(String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]))
  }
  return tags
}

/** Variable fonts carry an fvar table. */
export function isVariableFont(tags: string[]): boolean {
  return tags.includes('fvar')
}

/** Kerning lives in GPOS (modern) or the legacy kern table. */
export function hasKerningTables(tags: string[]): boolean {
  return tags.includes('GPOS') || tags.includes('kern')
}
