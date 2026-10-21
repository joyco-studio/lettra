---
name: lettra
description: Build and debug expressive 3D typography with JOYCO’s Lettra library for Three.js WebGPURenderer and TSL. Use for font-atlas baking, scene text, reveals and scrambles, interactive text effects, font variants, or Lettra rendering issues.
---

# Lettra

Turn a font, words, and a visual direction into typography that lives inside a scene. Lettra supplies MSDF font layout, glyph geometry, and composable TSL materials; the application supplies the scene, camera, interaction, and animation timing.

## Choose the right boundary

Use Lettra for text that needs perspective, object occlusion, shader effects, or interaction inside a Three.js scene. Prefer HTML for ordinary reading copy and navigation. When scene-integrated text is part of the experience, preserve an appropriate semantic equivalent for meaningful content and keyboard/touch access to important actions.

- Use `WebGPURenderer` from `three/webgpu`, including its WebGL2 fallback. A classic `WebGLRenderer` cannot render these TSL materials. Preserve the existing renderer unless changing it is part of the task.
- Lettra lays out baked glyphs; it does not shape Arabic/Indic text, bidirectional paragraphs, contextual ligatures, or color emoji. Check the actual copy and glyph coverage before choosing it.
- Glyphs are atlas-backed quads, not extruded font outlines. If the brief needs physical letter thickness, explain that a separate geometry solution is needed.
- Do not replace an existing typography stack just because this skill is available.

## Establish the version and inputs

Inspect the installed `lettra` version, its exports/type declarations, and the project’s renderer setup before implementing. These examples were checked against **Lettra 0.3.0 and Three.js 0.186.1**; match the installed release rather than assuming every API is present.

Use the supplied font and copy. If either is essential and missing, ask for it while preparing the scene integration. For an expressly provisional prototype, an existing project font is a reasonable stated default. Do not silently substitute a font or imply permission to redistribute it.

Official references:

- [Documentation index](https://lettra.joyco.studio/llms.txt): discover current API pages; documentation supports `Accept: text/markdown`.
- [Source](https://github.com/joyco-studio/lettra): implementation and examples.
- Installed `lettra/dist/three.d.ts` and `lettra/dist/index.d.ts`: signatures for the version being used.

## Build the smallest useful scene integration

1. **Prepare assets.** Reuse a matching metrics JSON and atlas PNG if available. Otherwise bake the font at development time; runtime text does not consume a TTF directly. Read [Font workflow](references/font-workflow.md) for filenames, charset coverage, variable fonts, and families.
2. **Load together.** `loadFont` loads metrics; `loadFontTexture` loads and configures the atlas. Use the application’s existing asset owner/cache if appropriate. The atlas is linear distance data, not an sRGB image.
3. **Create and place.** Start with `createText`, attach `text.mesh` to the existing scene or a group, and compose it with the camera and objects. Read [Scene integration](references/scene-integration.md) for a typed example, units, depth, and lifecycle.
4. **Warm before showing.** Await `text.warmup(renderer, camera, scene)` or the existing scene-level texture-upload/pipeline-compile pass. Avoid warming the same scene redundantly.
5. **Add behavior.** Change uniform `.value` fields in the existing animation loop. Use `setText` when the string/layout changes, not as a per-frame animation mechanism. Read [Effects and interaction](references/effects-and-interaction.md) when adding reveals, scrambles, or custom fields.

Prefer shared font assets and small scene/effect modules over duplicating complete renderers or asset loaders. This is an integration choice, not a requirement to introduce React, a UI kit, an animation library, or a JOYCO loader dependency.

## Check the result where it matters

Use the project’s focused typecheck and inspect the rendered scene. Verify the requested copy at the intended scale/angle, punctuation and accents, and overlaps with foreground/background objects. Check the WebGL2 fallback when fallback support is part of the feature.

For animated work, inspect the start, middle, end, and interruption/reversal of the transition. Reset all participating effect uniforms on replay. Keep reduced-motion output readable and provide a keyboard/touch route to important interactions.

For mount/unmount or font changes, check resource ownership: no disposed shared atlas, stale geometry paired with a new atlas, duplicate render loop, or lingering input listener. Preserve a semantic description or fallback for meaningful canvas content.

A successful typecheck does not establish visual correctness. Report what was actually inspected, the asset paths produced, and any renderer/font limitations still affecting the requested result.
