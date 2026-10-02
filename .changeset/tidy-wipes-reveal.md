---
"lettra": minor
---

Initial release: MSDF text for Three.js WebGPURenderer + TSL. Core layout engine (BMFont/minified schema parsing, kerned pen advance, greedy word wrap, align, letter-spacing, ink-bounds), `lettra/three` integration (quad-per-glyph BufferGeometry with layoutX/glyphIndex/lineIndex animation attributes, composable node material with median-of-RGB reconstruction, fwidth AA and threshold-erosion wipes, glyph `scramble` effect with a `drive` seam for custom scalar fields, `composeEffects` for stacking, `createText` handle accepting parsed fonts or raw font JSON, atomic font swap, warmup and dispose lifecycle). Font loading via `loadFont` (fetch + parse, cached by URL) and memoized `parseFont`.
