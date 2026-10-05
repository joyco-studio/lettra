import { CanvasTexture, LinearFilter, NoColorSpace, TextureLoader } from 'three/webgpu'
import type { Texture } from 'three/webgpu'

/** Configures a texture for MSDF atlas sampling. The atlas stores distances,
 * not color: it must bypass sRGB decode (NoColorSpace), keep y-down UVs
 * (flipY = false), and sample linearly without mipmaps — mip averaging
 * corrupts the distance field at glancing angles. Alpha must never
 * premultiply: on delta-channel bakes it carries a distance delta. */
export function configureFontTexture<T extends Texture>(texture: T): T {
  texture.flipY = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.colorSpace = NoColorSpace
  texture.anisotropy = 1
  texture.premultiplyAlpha = false
  texture.needsUpdate = true
  return texture
}

/** Loads an MSDF atlas PNG and applies `configureFontTexture`. */
export async function loadFontTexture(url: string): Promise<Texture> {
  const texture = await new TextureLoader().loadAsync(url)
  return configureFontTexture(texture)
}

/** EXPERIMENTAL: decode options pinned so the alpha-stored delta survives. */
export async function experimental_loadDeltaFontTexture(url: string): Promise<Texture> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[lettra] failed to load atlas ${url}: ${response.status} ${response.statusText}`)
  }
  const bitmap = await createImageBitmap(await response.blob(), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  return configureFontTexture(new CanvasTexture(bitmap))
}
