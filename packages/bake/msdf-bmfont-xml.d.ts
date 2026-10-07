declare module 'msdf-bmfont-xml' {
  interface BMFontTexture {
    filename: string
    texture: Buffer
  }
  interface BMFontFile {
    filename: string
    data: string
  }
  interface GenerateOptions {
    outputType?: 'xml' | 'json' | 'txt'
    filename?: string
    charset?: string | string[]
    fontSize?: number
    textureSize?: [number, number]
    texturePadding?: number
    border?: number
    distanceRange?: number
    fieldType?: 'msdf' | 'sdf' | 'psdf'
    roundDecimal?: number
    smartSize?: boolean
    pot?: boolean
    square?: boolean
    rot?: boolean
    rtl?: boolean
  }
  function generateBMFont(
    fontPath: string | Buffer,
    options: GenerateOptions,
    callback: (error: Error | null, textures: BMFontTexture[], fontFile: BMFontFile) => void,
    logger?: { log(msg: string): void; warn(msg: string): void; error(msg: string): void }
  ): void
  export = generateBMFont
}
