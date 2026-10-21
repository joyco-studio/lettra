# Effects and interaction

Use when animating type or building a custom TSL effect. Build the shader graph once; animate uniform values in the application’s existing loop.

## Built-in effects

`wipe({ band?, coord? })` erodes the signed distance field; it is not a hard rectangular clip. `wipeIn` runs from 0 (hidden) to 1 (revealed); `wipeOut` runs from 0 (not consumed) to 1 (consumed). Both sweep in the same direction. Reset both values before replaying. Reverse the existing timeline/progress for an interrupted reversal rather than creating overlapping animations.

`coord` defaults to `layoutX`, spanning the text’s ink width. Other geometry attributes include `cellUv`, `glyphIndex`, and `lineIndex`. Use an explicit coordinate field for per-line or spatial effects.

`scramble({ font, chars?, rate?, drive?, capacity? })` samples replacement glyphs from the same font atlas. Its `scramble` uniform runs from 0 (original copy) to 1 (all glyphs engaged). Same-height pools such as uppercase letters/digits, or monospaced fonts, read more consistently than arbitrary mixed glyphs.

`composeEffects(...effects)` chains stages left to right. Uniform keys merge with later keys winning; reusing an effect instance shares its uniforms. Use distinct instances when texts need independent timing.

## A shared interaction field

The following example tints and scrambles text near a world-space pointer position. It assumes the caller owns `font` and `map`. The application supplies pointer projection and animation timing.

```ts
import {
  composeEffects, createText, scramble, type TextEffect,
} from 'lettra/three'
import type { MSDFFont } from 'lettra'
import { Vector2, type Texture } from 'three/webgpu'
import { color, mix, positionWorld, uniform } from 'three/tsl'

export function createReactiveText(font: MSDFFont, map: Texture) {
  const pointer = uniform(new Vector2())
  const strength = uniform(0)
  const radius = uniform(2)
  const proximity = positionWorld.xy.sub(pointer).length()
    .div(radius).oneMinus().clamp(0, 1).mul(strength)
  const tint: TextEffect = {
    uniforms: {},
    stages: { color: (previous) => mix(previous, color('#78b3d1'), proximity) },
  }
  const scrambleFx = scramble({
    font,
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    drive: proximity,
  })
  const text = createText({
    font, map,
    text: 'MAKE IT RESPOND',
    material: { effect: composeEffects(scrambleFx, tint) },
  })
  return { text, pointer, strength, radius, scrambleFx }
}
```

Project the pointer onto the text’s interaction plane with the scene camera/raycaster, then update `pointer.value` in that same world XY space. For tilted surfaces, use a consistent local-space field instead. Keep `radius.value` positive and `strength.value` in 0–1; set strength to zero on pointer exit. The snippet’s circular field is an example, not a built-in water simulation.

A direct `drive` replaces scramble’s normal uniform driver. Use `drive: (base) => ...` if a manual amount should combine with the field. For a font swap, call `scrambleFx.setPool(nextFont)` alongside `text.swapFont(...)`; allocate sufficient `capacity` up front if later pools are larger.

For click ripples, track a bounded set of centers/start times/amplitudes and compute a time-varying scalar field in a consistent space. Feed that field to an effect; smooth vertex displacement is a separate geometry/node-material concern. Lettra’s glyph geometry has four vertices per quad, so moving those vertices cannot produce arbitrarily detailed curvature within a letter.

## Custom graphs

`TextEffect` has a uniform bag and optional `stages`: `uv`, `erosion`, `color`, `opacity`. Each transform receives the previous value; adding versus replacing is the transform’s responsibility. Use `fontBound` when sampling font-specific atlas rectangles.

Prefer this contract over replacing the entire MSDF shader. `createTextMaterial` exposes `.nodes`; `buildTextGraph` returns graph stages without owning a material. Preserve coverage/anti-aliasing when connecting these to another node material.

## Whole-phrase reveals

Keep atlas sampling and effect coordinates separate. Glyph-atlas UVs locate MSDF coverage; they do not describe a continuous word or paragraph. For a center-out reveal across an entire phrase, build the radial/noise field from object-local positions and measured text bounds in the same units. Normalize by those bounds deliberately: account for their aspect ratio when the front should expand at equal physical speed in all directions. Use `cellUv` only when the effect should repeat independently in each glyph.

Apply a custom reveal through `stages.opacity: (previous) => previous.mul(revealCoverage)` so existing opacity remains composed and the material retains glyph coverage. Keep pigment/color animation separate from coverage. Explicitly guarantee zero coverage at progress 0 and full coverage at progress 1; a noisy, feathered threshold can otherwise leave initial specks or unfinished edges. Use independent progress uniforms for independently timed phrases, while sharing the field construction and clock where useful.

## Restrained glow and heat

A warm fill tint alone is a color transition, not a glow. For an ember-like hover, vary a restrained heat field over local text coordinates and time, and optionally add a soft MSDF-derived halo or use the scene’s existing bloom pipeline. Do not introduce postprocessing solely by default. Keep halos tied to glyph distance/coverage rather than lighting the rectangular glyph quads, and avoid duplicate coincident surfaces that cause depth artifacts.

Inspect thin handwriting against its actual background at the intended scale. Broad or bright halos can erase contrast and obscure letter shapes. Tune the core color, halo width/opacity, and eased hover strength together; verify both hover entry and exit. Associated banner-outline effects belong to the banner material, not the font atlas.

Keep the result readable with reduced motion: settle reveals into a visible state, stop autonomous scrambling, and limit explicit interactions appropriately. Test both normal and reduced-motion paths; a stopped clock with hidden `wipeIn` is not a readable fallback.
