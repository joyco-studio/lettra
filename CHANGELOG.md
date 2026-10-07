# lettra

## 0.3.0

### Minor Changes

- 1a43070: Font families, italics, italic spans, and the bake CLI.

  - `defineFamily`: next/font-style variant declaration with CSS-like resolution, lazy `load`/`loadAll`, sync `get`/`has`, family-level `warmup`/`dispose`. `createText({ variant })` and `text.setVariant()` ride the atomic swapFont path; family-owned atlases are never disposed by texts.
  - Italics resolve like CSS: an italic request serves the italic bake, or the nearest upright one sheared by a synthetic oblique. Weight search follows CSS Fonts 4 (heavier first above 500, lighter first below 400); a weight with no bake serves its neighbour unmodified, since weight itself is never synthesized.
  - `createRichText({ family, text, spans })`: italic or weight spans inside one paragraph. Wrapping, alignment and the baseline stay paragraph-wide, and runs bucket by resolved variant so repeated spans share a draw call.
  - `npx lettra bake`: sfnt preflight, fontTools instancing, GPOS kerning recovery (class-based PairPos that opentype.js misses), charset presets, and cmap coverage checking so unmappable characters are dropped instead of baked as tofu.

  The bake tooling ships inside `lettra` as a bin entry. Its baker, `msdf-bmfont-xml`, is an optional peer loaded on demand: unreachable from the `.` and `./three` entries, so it costs nothing in a client bundle, and not installed at all unless you bake. `npx lettra bake` prompts for it if it is missing.

## 0.2.0

### Minor Changes

- eb87d10: Effects are now wire transforms, and the text graph is fully exposed.

  The graph has named wires resolved in a fixed order (`uv`, `erosion`, `color`, `opacity`). An effect is a uniform bag plus `stages`: per-wire transforms that receive the value so far and return the new one, so add vs replace is the effect's own node math. Recoloring is first-class via the `color` wire, and new wires land without breaking existing effects. `composeEffects` now just chains transforms left to right (no per-wire merge rules) and its return type is exported as `ComposedEffect` for naming handle fields.

  New `buildTextGraph({ map, effect, color?, opacity? })` resolves the wires and returns every stage as plain TSL nodes (`uv`, `textureNode`, `distance`, `aa`, `erosion?`, `threshold`, `coverage`, `color`, `opacity`), owning no material or uniforms. `createTextMaterial` assembles on top of it and returns the stages as `nodes`; `createText` handles expose `nodes` too.

  Breaking: `TextEffect`'s `uv`/`erosion` hooks moved into `stages` with transform signatures (`stages.uv: (prev) => uv`, `stages.erosion: (prev, { distance, aa }) => erosion`); `TextEffectUvContext`/`TextEffectContext` were replaced by `TextFieldContext`/`TextShadeContext`.

### Patch Changes

- 3631606: Point the package `homepage` at lettra.joyco.studio instead of the GitHub readme, and link the site from the readme, including its `llms.txt` and the Markdown representation available at every URL through `Accept: text/markdown`.

## 0.1.0

### Minor Changes

- 9d50d15: Initial release: MSDF text for Three.js WebGPURenderer + TSL. Core layout engine (BMFont/minified schema parsing, kerned pen advance, greedy word wrap, align, letter-spacing, ink-bounds), `lettra/three` integration (quad-per-glyph BufferGeometry with layoutX/glyphIndex/lineIndex animation attributes, composable node material with median-of-RGB reconstruction, fwidth AA and threshold-erosion wipes, glyph `scramble` effect with a `drive` seam for custom scalar fields, `composeEffects` for stacking, `createText` handle accepting parsed fonts or raw font JSON, atomic font swap, warmup and dispose lifecycle). Font loading via `loadFont` (fetch + parse, cached by URL) and memoized `parseFont`.
