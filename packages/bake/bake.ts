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
}

export interface BakeResult {
  /** lettra-native minified schema. */
  font: MSDFFont
  /** Atlas PNG. */
  png: Buffer
}

function fail(message: string): never {
  throw new Error(`[lettra] ${message}`)
}

const BAKER_HINT =
  'the MSDF baker is an optional peer, so a browser-only install of lettra skips it — install it with `npm i -D msdf-bmfont-xml`'

/** Resolved on demand rather than imported at module scope: `lettra` is a
 * browser library, and nothing but `lettra bake` should make its consumers
 * install the baker's Node-only dependency tree. */
async function loadBaker() {
  try {
    return (await import('msdf-bmfont-xml')).default
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') fail(BAKER_HINT)
    throw error
  }
}

/** Bakes one static font file into a single-page MSDF atlas + lettra JSON. */
export async function bakeFont(fontPath: string, settings: BakeSettings): Promise<BakeResult> {
  const generateBMFont = await loadBaker()
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
        smartSize: false,
        ...(settings.charset ? { charset: settings.charset } : {}),
      },
      (error, textures, fontFile) => {
        if (error) return reject(error)
        try {
          if (textures.length !== 1) {
            fail(`bake produced ${textures.length} atlas pages; raise --texture so every glyph fits one page`)
          }
          const bmfont = JSON.parse(fontFile.data) as BMFontJson
          resolve({ font: fromBMFont(bmfont), png: textures[0].texture })
        } catch (parseError) {
          reject(parseError)
        }
      },
      // silence only the per-glyph progress logging. The baker's error channel
      // carries the msdfgen command and its output, which is the only clue on
      // its hard failure path — dropping it leaves a bare RangeError
      {
        log: () => {},
        warn: (msg: string) => console.warn(`[lettra] ${msg}`),
        error: (msg: string) => console.error(`[lettra] baker: ${msg}`),
      }
    )
  })
}
