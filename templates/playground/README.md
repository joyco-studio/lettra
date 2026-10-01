# letterpress playground

Live letterpress demo skinned with the [JOYCO UI kit](https://hub.joyco.studio)
(Cluster/Filler layout, `@joyco` shadcn registry, Tailwind v4, dark console
theme). React owns only the control panel. The actual letterpress usage lives
in [`src/scene.ts`](./src/scene.ts) as plain imperative Three.js, exactly how a
consumer without React would write it.

- Editable text, font swap (exercises the atomic `swapFont` + scramble
  `setPool`), align / letter-spacing / max-width, erosion wipe buttons, a
  glyph-scramble button (the wipe front also drives it, so scrambled glyphs
  ride the dissolve edge), drag to tilt, dpr ≤ 2.
- **Code panel** (bottom right): the *usage* tab is a live snippet that
  rewrites itself as you change controls; copy-paste it and you reproduce
  the current canvas. The *implementation* tab shows `scene.ts` verbatim.
- `?forceWebGL` exercises the WebGL2 fallback path.

```bash
pnpm --filter @templates/playground dev
```

## Baking the fonts (manual, for now)

The fonts in `public/fonts/` were baked with [msdf-bmfont-xml](https://github.com/soimy/msdf-bmfont-xml)
and minified with letterpress' own `fromBMFont`:

```bash
# charset: ASCII + áéíóúüñÁÉÍÓÚÜÑ¿¡—–“”‘’ (one file, no newline)
npx -y -p msdf-bmfont-xml msdf-bmfont \
  -f json -i charset.txt -s 64 -r 8 -p 2 -t msdf --smart-size font.ttf

node -e "import('letterpress').then(({ fromBMFont }) => {
  const fs = require('fs')
  const font = fromBMFont(JSON.parse(fs.readFileSync('font.json', 'utf8')))
  fs.writeFileSync('font.min.json', JSON.stringify(font))
})"
```

(The raw BMFont JSON also loads directly; `loadFont`/`createText` auto-detect
it. The minify step just turns ~170 KB of generator output into ~9 KB.)

Recipe notes:

- `-r 8` (distanceRange) is deliberate: it leaves SDF headroom for the
  threshold-erosion wipes. Shallow ranges make dissolves snap.
- Keep the atlas on a **single page**; letterpress rejects multi-page bakes.
  If glyphs don't fit, raise the texture size instead.
- Never enable rotated glyph packing; the UV builder assumes upright rects.
- Check the reported kerning count. Variable fonts come out with **0 pairs**
  when their kerning lives in variable GPOS; Playfair Display did exactly
  this in testing. Instancing to a static weight first restores every pair
  (Playfair: 0 → 2362):

  ```bash
  python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf
  ```

  Bebas Neue bakes 1348 raw pairs, Lora 182 (same before/after instancing;
  only resolve-at-default-instance kerning is affected).
- A browser alternative: [msdf-font-generator.leomouraire.com](https://msdf-font-generator.leomouraire.com)
  bakes the atlas + JSON without installing anything.

Fonts: [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) and
[Lora](https://fonts.google.com/specimen/Lora) (SIL Open Font License), plus
[PP Lettra Mono](https://pangrampangram.com/products/lettra-mono) (licensed;
also the UI mono face). Lettra Mono is there for the scramble effect:
glyph swaps read best when every glyph shares one ink box. A mono face
legitimately has zero kerning pairs, so the empty-kerning warning is
expected for it.
