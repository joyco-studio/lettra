/** Glyph metrics tuple: [x, y, width, height, xoffset, yoffset, xadvance].
 * Atlas pixels, y-down, origin at the atlas top-left. */
export type GlyphTuple = [number, number, number, number, number, number, number]

/** The minified font schema lettra consumes — the output of an MSDF bake
 * (atlas PNG + this JSON). Produce it from a BMFont JSON via `fromBMFont`. */
export interface MSDFFont {
  name: string
  /** Font size (px) the atlas was baked at. Scale factor between layout px and em. */
  size: number
  /** Distance from one line top to the next, in baked px. */
  lineHeight: number
  /** Distance from the line top to the baseline, in baked px. */
  base: number
  /** Pixel range of the signed distance field. Needed for AA and wipe headroom. */
  distanceRange: number
  atlas: { width: number; height: number }
  /** Keyed by character. */
  glyphs: Record<string, GlyphTuple>
  /** Keyed by the two characters of the pair concatenated, e.g. "AV" → -3. */
  kerning: Record<string, number>
}

/** Anything `parseFont` accepts: an already-parsed font (passes through
 * untouched) or raw font JSON in either supported schema. */
export type FontInput = MSDFFont | BMFontJson

/** A resolved glyph, expanded from the tuple form. */
export interface Glyph {
  char: string
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
}

export type TextAlign = 'left' | 'center' | 'right'

export type WrapMode = 'greedy' | 'pre' | 'nowrap'

export interface LayoutOptions {
  align?: TextAlign
  /** Extra advance between glyphs, in baked px. */
  letterSpacing?: number
  /** Overrides the font's baked lineHeight, in baked px. */
  lineHeight?: number
  /** Enables word wrap (greedy mode unless `mode` says otherwise), in baked px. */
  maxWidth?: number
  mode?: WrapMode
  /** Tab width in multiples of the space advance. */
  tabSize?: number
}

/** One positioned quad. Coordinates are layout px, y-down, with the first
 * line's top at y = 0. UVs are y-down atlas ratios (use with flipY = false). */
export interface LayoutGlyph {
  char: string
  x: number
  y: number
  w: number
  h: number
  u0: number
  v0: number
  u1: number
  v1: number
  /** Index of the character in the source string. */
  index: number
  line: number
}

/** Font-metric measurements, for callers doing line-box math. The top-level
 * width/height on LayoutResult are ink bounds instead — display faces carry
 * asymmetric lineHeight/baseline padding, and metric-centering reads as
 * misalignment. */
export interface LayoutMetrics {
  /** The font size the atlas was baked at — the layout-px per em factor. */
  fontSize: number
  lineCount: number
  lineHeight: number
  /** Line top → baseline distance. */
  baseline: number
  metricWidth: number
  metricHeight: number
}

export interface LayoutResult {
  glyphs: LayoutGlyph[]
  /** Ink bounding-box width (px). 0 when nothing is drawn. */
  width: number
  /** Ink bounding-box height (px). 0 when nothing is drawn. */
  height: number
  /** Top-left of the ink bounding box in layout space. */
  inkOrigin: { x: number; y: number }
  metrics: LayoutMetrics
}

/** The subset of the BMFont JSON format (msdf-bmfont-xml, msdf web generators)
 * that lettra reads. */
export interface BMFontChar {
  id: number
  char?: string
  x: number
  y: number
  width: number
  height: number
  xoffset: number
  yoffset: number
  xadvance: number
}

export interface BMFontKerning {
  first: number
  second: number
  amount: number
}

export interface BMFontJson {
  info?: { face?: string; size?: number }
  common: {
    lineHeight: number
    base: number
    scaleW: number
    scaleH: number
    pages?: number
  }
  pages?: string[]
  chars: BMFontChar[]
  kernings?: BMFontKerning[]
  distanceField?: { fieldType?: string; distanceRange?: number }
}
