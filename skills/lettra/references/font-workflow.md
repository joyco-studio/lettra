# Font workflow

Use when preparing atlases, adding weights/italics, or diagnosing missing glyphs and spacing. Commands and contracts below target Lettra 0.3.0; check the installed CLI help before using them with another release.

## Bake at development time

Use the project’s package manager. For a pnpm project:

```sh
pnpm add lettra three
pnpm add -D msdf-bmfont-xml
pnpm exec lettra bake ./font.ttf --charset latin-es --size 64 --pxrange 8 --out public/fonts/display
```

The baker is an optional peer, so a runtime-only installation need not include it. Variable-font instancing requires Python fontTools; install it through the project’s Python environment rather than changing a global environment unnecessarily. It is also recommended for recovering kerning from static faces.

`--out` is a **filename prefix**, not a directory. Read the generated paths and the printed `defineFamily` block: a static font is labelled from its OS/2 weight, and filenames may be `display-400.json` and `display-400.png`, not `display.json`. Under a standard `public/` directory, the browser URL is `/fonts/display-400.json`.

For a variable family with a companion italic source:

```sh
pnpm exec lettra bake ./Inter.ttf --weights 400,700 --italic ./Inter-Italic.ttf --charset latin-es --size 64 --pxrange 8 --out public/fonts/inter
```

`--weights` instances variable fonts; it does not turn a static regular font into a real bold face. Use actual font files for static variants. CSS `font-weight` and `font-style` do not change baked scene glyphs. Retain the source font’s redistribution license with shipped assets and record reproducible bake commands in the project. Treat each metrics JSON and atlas PNG as a matched pair; replace both when rebaking a face.

## Inspect the output

- Choose a charset that covers the requested copy: accents, curly quotes, dashes, ellipsis, and any scramble pool. `--charset` accepts a preset, a file, or a literal string. Presets include `ascii`, `latin`, `latin-es`, `latin-pt`, `latin-fr`, `latin-de`, and `latin-ext`.
- Include space and `?` for runtime fallbacks. Missing supported characters render as `?`; unsupported source-font glyphs are dropped with a warning.
- Use one atlas page and unrotated glyph packing. If the bake exceeds capacity, increase `--texture` or narrow the charset deliberately; do not silently omit required glyphs.
- A distance range of 8 gives erosion effects headroom. Keep size/range consistent across a family.
- Inspect the kerning count. Zero pairs can indicate lost variable GPOS kerning, although a font may intentionally have none. Lettra’s bake command instances variable fonts before baking; do not bypass that step with a raw generator without checking the result.

Use `loadFontTexture`, or `configureFontTexture` for a custom texture loader. The configuration is `NoColorSpace`, `flipY: false`, linear filtering, no mipmaps, and no premultiplied alpha. Treating the atlas as a color image damages the distance field.

## Families and rich text

`defineFamily({ src: [...] })` takes entries with `json`, `atlas`, `weight`, and optional `style: 'italic'`. Use the baker’s emitted URLs.

- `await family.load({ weight, style })` returns a loaded variant for `createText({ variant, text })` or `text.setVariant(variant)`.
- `family.get(key)` is synchronous and can return null until loaded; `family.has(key)` checks an exact bake.
- Missing weights resolve to neighboring bakes, not synthesized bold. Missing italic may use a sheared oblique. Use `synthesis: false` when a missing exact variant should fail.
- `family.warmup(renderer)` uploads loaded atlases; text/scene warmup still handles pipeline compilation.
- The family owns its textures. Dispose text handles first, then the family after all users are done.

Use `createRichText` for mixed weights/styles in one paragraph; add its `.group`, not `.mesh`. Load the needed variants before creation. Spans are non-overlapping `[start, end)` ranges, with gaps using the base variant. Do not assume a separate text object per span will preserve paragraph wrapping or baselines.

Rich-text effects have an important boundary: `wipe` can cover all variant buckets, but `scramble` is font-bound and applies only to buckets using the base variant’s font. Do not reuse one atlas-rect pool on other fonts.
