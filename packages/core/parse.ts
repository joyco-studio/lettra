import type { BMFontJson, Glyph, GlyphTuple, MSDFFont } from './types'

function fail(message: string): never {
  throw new Error(`[letterpress] ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Detects the raw BMFont JSON shape emitted by msdf-bmfont-xml and the MSDF
 * web generators (`common` block + `chars` array). */
export function isBMFont(data: unknown): data is BMFontJson {
  return isRecord(data) && isRecord(data.common) && Array.isArray(data.chars)
}

/** Converts a BMFont JSON (the manual bake output) into the minified MSDFFont
 * schema: chars keyed by character, kerning pairs keyed by "<left><right>",
 * generator noise (id/index/chnl/page) dropped. */
export function fromBMFont(data: BMFontJson): MSDFFont {
  if (!isBMFont(data)) fail('not a BMFont JSON: expected a `common` block and a `chars` array')

  const { common } = data
  for (const key of ['lineHeight', 'base', 'scaleW', 'scaleH'] as const) {
    if (typeof common[key] !== 'number') fail(`BMFont common.${key} is missing or not a number`)
  }
  const pageCount = common.pages ?? data.pages?.length ?? 1
  if (pageCount > 1) {
    fail(
      `multi-page atlas (${pageCount} pages) is not supported — rebake with a larger texture size so every glyph fits one page`
    )
  }

  const glyphs: Record<string, GlyphTuple> = {}
  for (const c of data.chars) {
    const char = c.char ?? String.fromCharCode(c.id)
    glyphs[char] = [c.x, c.y, c.width, c.height, c.xoffset, c.yoffset, c.xadvance]
  }

  const kerning: Record<string, number> = {}
  for (const k of data.kernings ?? []) {
    if (k.amount !== 0) {
      kerning[String.fromCharCode(k.first) + String.fromCharCode(k.second)] = k.amount
    }
  }

  return {
    name: data.info?.face ?? 'unknown',
    size: Math.abs(data.info?.size ?? common.lineHeight),
    lineHeight: common.lineHeight,
    base: common.base,
    distanceRange: data.distanceField?.distanceRange ?? 4,
    atlas: { width: common.scaleW, height: common.scaleH },
    glyphs,
    kerning,
  }
}

/** Raw JSON → same MSDFFont object, so lookup caches keyed by font identity
 * still hit when the same fetched JSON feeds many texts. */
const parseCache = new WeakMap<object, MSDFFont>()
/** Brands parseFont outputs so re-parsing an already-parsed font is a no-op. */
const parsedFonts = new WeakSet<object>()

/** Validates font JSON of either shape — raw BMFont (routed through
 * `fromBMFont`) or the minified MSDFFont schema — and returns an MSDFFont.
 * Idempotent and memoized by input identity: already-parsed fonts pass
 * through, and the same JSON object always yields the same MSDFFont object.
 * Throws a descriptive error on malformed input; warns when runtime fallback
 * glyphs (space, `?`) are missing from the baked charset. */
export function parseFont(data: unknown): MSDFFont {
  if (!isRecord(data)) fail('font data must be an object (did you pass a URL instead of parsed JSON?)')
  if (parsedFonts.has(data)) return data as unknown as MSDFFont
  const cached = parseCache.get(data)
  if (cached) return cached

  const font = isBMFont(data) ? fromBMFont(data) : validateMSDFFont(data)

  if (!(' ' in font.glyphs)) {
    console.warn('[letterpress] baked charset has no space glyph — word spacing will be approximated')
  }
  if (!('?' in font.glyphs)) {
    console.warn(
      '[letterpress] baked charset has no "?" glyph — characters outside the charset will be skipped instead of substituted'
    )
  }
  if (Object.keys(font.kerning ?? {}).length === 0) {
    console.warn(
      '[letterpress] font has 0 kerning pairs — if the source font kerns (most text faces do), the bake dropped its GPOS kerning. Instance variable fonts to a static weight first: `python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf`'
    )
  }
  parseCache.set(data, font)
  parsedFonts.add(font)
  return font
}

const loadCache = new Map<string, Promise<MSDFFont>>()

/** Fetches and parses font JSON, cached by URL — concurrent and repeat calls
 * for the same URL share one request and one MSDFFont object. Failed loads are
 * evicted so they can be retried. */
export function loadFont(url: string, init?: RequestInit): Promise<MSDFFont> {
  let pending = loadCache.get(url)
  if (pending) return pending

  pending = fetch(url, init).then((response) => {
    if (!response.ok) fail(`failed to load font ${url}: ${response.status} ${response.statusText}`)
    return response.json().then(parseFont)
  })
  pending.catch(() => loadCache.delete(url))
  loadCache.set(url, pending)
  return pending
}

function validateMSDFFont(data: Record<string, unknown>): MSDFFont {
  for (const key of ['size', 'lineHeight', 'base', 'distanceRange'] as const) {
    if (typeof data[key] !== 'number') fail(`font.${key} is missing or not a number`)
  }
  const atlas = data.atlas
  if (!isRecord(atlas) || typeof atlas.width !== 'number' || typeof atlas.height !== 'number') {
    fail('font.atlas must be { width, height }')
  }
  if (!isRecord(data.glyphs)) fail('font.glyphs is missing')
  for (const [char, tuple] of Object.entries(data.glyphs)) {
    if (!Array.isArray(tuple) || tuple.length !== 7 || tuple.some((n) => typeof n !== 'number')) {
      fail(`font.glyphs[${JSON.stringify(char)}] must be a tuple of 7 numbers [x, y, w, h, xoffset, yoffset, xadvance]`)
    }
  }
  if (data.kerning !== undefined && !isRecord(data.kerning)) fail('font.kerning must be an object')
  return {
    name: typeof data.name === 'string' ? data.name : 'unknown',
    size: data.size as number,
    lineHeight: data.lineHeight as number,
    base: data.base as number,
    distanceRange: data.distanceRange as number,
    atlas: { width: atlas.width, height: atlas.height },
    glyphs: data.glyphs as Record<string, GlyphTuple>,
    kerning: (data.kerning ?? {}) as Record<string, number>,
  }
}

/** O(1) glyph and kerning lookups for a font, built once and cached per font
 * object. (The original layout-bmfont-text linear-scans the kerning array per
 * glyph pair.) */
export interface FontLookup {
  glyphs: Map<string, Glyph>
  kerning: Map<string, number>
}

const lookupCache = new WeakMap<MSDFFont, FontLookup>()

export function getFontLookup(font: MSDFFont): FontLookup {
  let lookup = lookupCache.get(font)
  if (lookup) return lookup

  const glyphs = new Map<string, Glyph>()
  for (const [char, [x, y, width, height, xoffset, yoffset, xadvance]] of Object.entries(font.glyphs)) {
    glyphs.set(char, { char, x, y, width, height, xoffset, yoffset, xadvance })
  }
  lookup = { glyphs, kerning: new Map(Object.entries(font.kerning ?? {})) }
  lookupCache.set(font, lookup)
  return lookup
}
