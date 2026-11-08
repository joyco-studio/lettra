# lettra playground

The source of [lettra.joyco.studio](https://lettra.joyco.studio), the live
specimen and docs site, skinned with the [JOYCO UI kit](https://hub.joyco.studio)
(Next.js App Router, `@joyco` shadcn registry, Tailwind v4).

One `WebGPURenderer` draws every figure on the page;
[PortalGL](https://www.npmjs.com/package/portalgl) keeps each view in sync with
its DOM box ([`src/gl/stage.ts`](./src/gl/stage.ts)). Each figure is a plain
imperative Three.js view under [`src/gl/views`](./src/gl/views), the way a
consumer without React would write it; React owns only the page and controls.

- `specimen.ts`: font switch, align, tracking, leading, measure, drag to tilt.
- `family.ts`: `defineFamily` weight and italic resolution.
- `rich-text.ts`: `createRichText` spans, edited with Tiptap.
- `wipe.ts`, `scramble.ts`: the two built-in effects.
- `liquid.ts`: a GPU fluid sim driving `scramble({ drive })`.

Every figure has a code toggle that shows its snippet. `?forceWebGL` exercises
the WebGL2 fallback. Every page also answers to `Accept: text/markdown`, and
`/llms.txt` is generated from the same content.

```bash
pnpm --filter @templates/playground dev
```

## Baking the fonts

The atlases and metrics in `public/fonts/` are committed. To add or rebake a
face, use lettra's bake CLI:

```bash
npx lettra bake Inter.ttf --weights 400,700 --italic Inter-Italic.ttf \
  --charset latin-es --size 64 --pxrange 8 --out public/fonts/inter
```

See [The bake CLI](../../README.md#the-bake-cli) for the options and the manual
msdf-bmfont-xml route.

Fonts: [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue),
[Lora](https://fonts.google.com/specimen/Lora),
[Inter](https://fonts.google.com/specimen/Inter) and
[Roboto Mono](https://fonts.google.com/specimen/Roboto+Mono) (all open
licenses; Roboto Mono is also the UI mono face, served via
`next/font/google`), plus a trial cut of Respira in the specimen and
[PP Lettra Mono](https://pangrampangram.com/products/lettra-mono) (licensed)
for the water paragraph. GT Sectra Fine (licensed) sets the page's own text.
The mono faces back the scramble effect: glyph swaps read best when every
glyph shares one ink box. A mono face legitimately has zero kerning pairs, so
the empty-kerning warning is expected for them.
