import type { BufferGeometry, Camera, Material, Object3D, Scene, Texture, WebGPURenderer } from 'three/webgpu'

export interface TextResources {
  geometry?: BufferGeometry
  material?: Material
  /** Pass the atlas explicitly — `material.dispose()` never disposes textures. */
  map?: Texture
}

/** Disposes whichever GPU resources are passed. */
export function disposeText({ geometry, material, map }: TextResources): void {
  geometry?.dispose()
  material?.dispose()
  map?.dispose()
}

export interface WarmupOptions {
  scene?: Scene
  /** Textures to force-upload before compiling (e.g. the atlas). */
  textures?: Texture[]
}

/** Forces texture upload and pipeline compilation off the hot path, so the
 * first visible frame with the text doesn't hitch on a WebGPU pipeline
 * compile. Call after adding the mesh (or before — pass it directly). */
export async function warmup(
  renderer: WebGPURenderer,
  object: Object3D,
  camera: Camera,
  { scene, textures = [] }: WarmupOptions = {}
): Promise<void> {
  for (const texture of textures) renderer.initTexture(texture)
  await renderer.compileAsync(object, camera, scene)
}
