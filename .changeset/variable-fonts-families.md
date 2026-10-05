---
'lettra': minor
---

Font families, synthetic axes, and the bake CLI.

- `defineFamily`: next/font-style variant declaration with CSS-like resolution, lazy `load`/`loadAll`, sync `get`/`has`, family-level `warmup`/`dispose`. `createText({ variant })` and `text.setVariant()` ride the atomic swapFont path; family-owned atlases are never disposed by texts.
- Synthetic axes: faux bold via an animatable `boldness` uniform (SDF threshold shift, `msdfBolden` node) and faux oblique via a baseline-anchored `slant` geometry option. Resolution boldens up from the nearest lighter bake and never synthesizes thinning, matching browsers.
- `npx lettra bake`: sfnt preflight, fontTools instancing, GPOS kerning recovery (class-based PairPos that opentype.js misses), charset presets, cmap coverage checking so unmappable characters are dropped instead of baked as tofu, and a ready-to-paste `defineFamily` block.
- Experimental: delta-channel variable weight and style runs, both behind `experimental_` prefixes.

The bake tooling ships inside `lettra` as a bin entry. Its dependencies are
Node-only and unreachable from the `.` and `./three` entries, so they cost
nothing in a client bundle.
