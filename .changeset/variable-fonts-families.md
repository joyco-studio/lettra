---
'lettra': minor
---

Font families, italics, and the bake CLI.

- `defineFamily`: next/font-style variant declaration with CSS-like resolution, lazy `load`/`loadAll`, sync `get`/`has`, family-level `warmup`/`dispose`. `createText({ variant })` and `text.setVariant()` ride the atomic swapFont path; family-owned atlases are never disposed by texts.
- Italics resolve like CSS: an italic request serves the italic bake, or the nearest upright one sheared by a synthetic oblique. Weight misses bolden up from the nearest lighter bake via an animatable `boldness` uniform, and never synthesize thinning.
- `createRichText({ family, text, spans })`: italic or weight spans inside one paragraph. Wrapping, alignment and the baseline stay paragraph-wide, and runs bucket by resolved variant so repeated spans share a draw call.
- `npx lettra bake`: sfnt preflight, fontTools instancing, GPOS kerning recovery (class-based PairPos that opentype.js misses), charset presets, and cmap coverage checking so unmappable characters are dropped instead of baked as tofu.

The bake tooling ships inside `lettra` as a bin entry. Its dependencies are Node-only and unreachable from the `.` and `./three` entries, so they cost nothing in a client bundle.
