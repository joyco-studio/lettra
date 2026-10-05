---
'lettra': minor
---

Effects are now wire transforms, and the text graph is fully exposed.

The graph has named wires resolved in a fixed order (`uv`, `erosion`, `color`, `opacity`). An effect is a uniform bag plus `stages`: per-wire transforms that receive the value so far and return the new one, so add vs replace is the effect's own node math. Recoloring is first-class via the `color` wire, and new wires land without breaking existing effects. `composeEffects` now just chains transforms left to right (no per-wire merge rules) and its return type is exported as `ComposedEffect` for naming handle fields.

New `buildTextGraph({ map, effect, color?, opacity? })` resolves the wires and returns every stage as plain TSL nodes (`uv`, `textureNode`, `distance`, `aa`, `erosion?`, `threshold`, `coverage`, `color`, `opacity`), owning no material or uniforms. `createTextMaterial` assembles on top of it and returns the stages as `nodes`; `createText` handles expose `nodes` too.

Breaking: `TextEffect`'s `uv`/`erosion` hooks moved into `stages` with transform signatures (`stages.uv: (prev) => uv`, `stages.erosion: (prev, { distance, aa }) => erosion`); `TextEffectUvContext`/`TextEffectContext` were replaced by `TextFieldContext`/`TextShadeContext`.
