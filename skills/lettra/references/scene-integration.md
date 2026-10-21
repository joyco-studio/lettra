# Scene integration

Use for the first text mesh, spatial sizing, occlusion, or resource cleanup. This example plugs into an existing initialized renderer and scene; it does not create another render loop.

## Minimal integration

Replace the asset URLs with the actual bake output. This function owns its loaded atlas.

```ts
import { createText, loadFont, loadFontTexture, wipe } from 'lettra/three'
import type { Camera, Scene, WebGPURenderer } from 'three/webgpu'

export async function addTitle(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
) {
  const [font, map] = await Promise.all([
    loadFont('/fonts/display-400.json'),
    loadFontTexture('/fonts/display-400.png'),
  ])
  const title = createText({
    font,
    map,
    text: 'Words you can walk through.',
    layout: { align: 'center', maxWidth: 900 },
    geometry: { anchor: 'ink-center' },
    material: { fill: '#e8e4da', effect: wipe({ band: 0.3 }) },
  })
  scene.add(title.mesh)
  try {
    await title.warmup(renderer, camera, scene)
  } catch (error) {
    title.mesh.removeFromParent()
    title.dispose()
    throw error
  }
  title.uniforms.wipeIn.value = 1
  title.uniforms.wipeOut.value = 0
  return title
}
```

Own pending asynchronous initialization in the application lifecycle. If a component unmounts while loading/warming, dispose the late result instead of attaching it to an abandoned scene. In React, keep handles in refs or the scene owner rather than rebuilding them during render; account for development Strict Mode cleanup.

## Units and placement

Layout options such as `maxWidth`, `letterSpacing`, and `lineHeight` use baked pixels. Geometry defaults to `1 / fontSize` world units per layout pixel, giving em-sized output. At that default, the mesh’s unscaled ink width is `text.layout.width / text.layout.metrics.fontSize`.

Use `geometry.scale` or the mesh/group transform to fit the world. Keep layout wrapping separate from world-space sizing. Empty text has no useful ink width: guard any division used to fit it.

`ink-center` centers visible ink; `baseline-left` anchors the first line’s left baseline. Layout width/height report ink bounds, while line-box measurements live in `.metrics`. Layout coordinates are y-down; built geometry is y-up. Synthetic slant can extend visible ink beyond the pre-shear bounds.

Attach text to the object it belongs to, such as a sign or television surface. Use scene depth to produce overlaps; CSS overlays and arbitrary `renderOrder` values do not provide per-letter physical occlusion. Decide whether back faces should be visible based on the scene.

## Depth and transparency

Default text materials are transparent with depth writing disabled. That works for many overlays and opaque-object occlusion, but intersecting translucent objects can expose sorting artifacts.

For text that must write ink depth, the documented opaque-pass option uses `transparent = false`, `depthWrite = true`, `alphaToCoverage = true`, and `alphaTestNode = float(0.5)` on the node material. Alpha-to-coverage requires multisampling to smooth edges; inspect it on the actual renderer/backend. Set these before warmup. Do not simply enable depth writing on a transparent quad and assume its empty pixels cannot occlude other objects.

If customizing `opacityNode`, preserve the MSDF coverage: combine `text.nodes.coverage`, `text.nodes.opacity`, and the extra fade. Replacing it with a scalar makes glyph quads visible. When nodes drive opacity, update the appropriate uniform/node rather than assuming `material.opacity` alone controls the result.

## Offscreen composition and label groups

Text may be rendered with artwork into an offscreen texture, then sampled by a curved or folding surface. Preserve continuous sheet UVs on the receiving geometry so the composed marks stay attached through deformation. Lettra’s glyph quads need not reproduce the paper’s curvature in this approach. Warm the composition scene as well as the final surface scene, and release their render targets through the scene owner.

The intermediate texture bounds final sharpness: MSDF source text does not make a rasterized render target resolution-independent. Choose its resolution against the displayed size and maximum zoom, and inspect small text after the complete rendering chain. Cache completed static layers separately from animated text, labels, or effects so hover and reveal updates remain visible.

For transparent overlay labels in a composition pass without useful depth, assign a consistent painter order to each complete label: banner, halo, then text. Draw the next label’s complete stack above the previous one. Rendering every banner first and every name last lets lower labels’ text show through higher banners. A Three.js `Group` alone does not guarantee this ordering. Use actual depth for physical scene occlusion; reserve explicit painter ordering for intentional layered composition.

## Changes and ownership

- `setText(next, layoutOptions?)` rebuilds layout/geometry in place. Use it for actual content/layout changes.
- Load the next atlas before calling `swapFont({ font, map, text? })`. The operation rebinds font, texture, and geometry atomically. Dispose the outgoing raw atlas only when nothing else uses it.
- `onChange(callback)` returns an unsubscribe function for demand-render invalidation on text changes, font swaps, and warmup completion. Uniform-only animation still needs frames requested by the application.
- On removal, detach `.mesh`, stop its animation/input subscriptions, and call `.dispose()`.
- Raw `{ font, map }` text disposes its current map by default. Shared atlases require `dispose({ map: false })` and a separate owner that disposes the map once.
- Family variants keep atlas ownership with the family. `material.dispose()` alone never releases textures.
