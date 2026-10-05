import generateBMFont from 'msdf-bmfont-xml'
import { fromBMFont } from '../core/parse'
import type { BMFontJson, MSDFFont } from '../core/types'

/** Mirrors msdf-bmfont-xml's default, for kerning extraction. */
export const DEFAULT_CHARSET =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'

export interface BakeSettings {
  /** Characters to bake. Defaults to msdf-bmfont-xml's Western charset. */
  charset?: string
  /** Font size (px) the atlas is baked at. */
  size: number
  /** Distance-field pixel range. */
  distanceRange: number
  /** Atlas dimensions. */
  textureSize: [number, number]
  texturePadding: number
  /** Forbidden for delta pairs: the two grids must agree. */
  smartSize?: boolean
}

export interface BakeResult {
  /** lettra-native minified schema. */
  font: MSDFFont
  /** Raw BMFont JSON, for delta compositing. */
  bmfont: BMFontJson
  /** Atlas PNG. */
  png: Buffer
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

/** Bakes one static font file into a single-page MSDF atlas + lettra JSON. */
export function bakeFont(fontPath: string, settings: BakeSettings): Promise<BakeResult> {
  return new Promise((resolve, reject) => {
    generateBMFont(
      fontPath,
      {
        outputType: 'json',
        fieldType: 'msdf',
        fontSize: settings.size,
        distanceRange: settings.distanceRange,
        textureSize: settings.textureSize,
        texturePadding: settings.texturePadding,
        smartSize: settings.smartSize ?? false,
        ...(settings.charset ? { charset: settings.charset } : {}),
      },
      (error, textures, fontFile) => {
        if (error) return reject(error)
        try {
          if (textures.length !== 1) {
            fail(`bake produced ${textures.length} atlas pages; raise --texture so every glyph fits one page`)
          }
          const bmfont = JSON.parse(fontFile.data) as BMFontJson
          resolve({ font: fromBMFont(bmfont), bmfont, png: textures[0].texture })
        } catch (parseError) {
          reject(parseError)
        }
      },
      // silence the per-glyph progress logging; errors still reject
      { log: () => {}, warn: (msg: string) => console.warn(`[lettra] ${msg}`), error: () => {} }
    )
  })
}
