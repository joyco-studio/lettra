---
'lettra': minor
'lettra-bake': minor
---

Font families, synthetic axes, and experimental variable weight.

- `defineFamily`: next/font-style variant declaration with CSS-like resolution, lazy `load`/`loadAll`, sync `get`/`has`, family-level `warmup`/`dispose`. `createText({ variant })` and `text.setVariant()` ride the atomic swapFont path; family-owned atlases are never disposed by texts.
- Synthetic axes: faux bold via an animatable `boldness` uniform (SDF threshold shift, `msdfBolden` node) and faux oblique via a baseline-anchored `slant` geometry option. Resolution misses return the nearest bake plus corrections.
- Experimental single-atlas continuous weight: delta-channel bakes (`weightRange`, alpha-encoded distance deltas, `experimental_msdfDeltaDistance`, `experimental_setWeightT`, `experimental_interpolateFont`).
- Experimental style runs: `experimental_layoutRuns` (whole-paragraph wrap across font runs) and `experimental_createRichText` (italic/weight spans in one text, one draw per variant).
- New bake CLI (`npx lettra bake`, implementation in `lettra-bake` so the runtime package stays dependency-lean): sfnt preflight, fontTools instancing, GPOS kerning recovery (class-based PairPos that opentype.js misses), pinned MSDF settings, lettra-native JSON, ready-to-paste `defineFamily` block, and a `delta` subcommand for variable-weight atlases.
