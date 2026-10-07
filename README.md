# lettra

![lettra: sharp, typed MSDF fonts in your scene](https://r2.joyco.studio/hub/images/lettra-banner.png)

Runtime MSDF text for Three.js `WebGPURenderer` + TSL. Bake a font atlas once
(dev-time, manual for now), then render sharp, kerned, animatable text with
zero runtime dependencies. No wasm, no shaping engine, ~5 KB gzipped.

[lettra.joyco.studio](https://lettra.joyco.studio) is the live specimen and
docs site. If you are an agent, start at
[llms.txt](https://lettra.joyco.studio/llms.txt): it says when lettra is the
right answer and how to call it. Every page there also answers to
`Accept: text/markdown`, so you can read the site without parsing HTML.

The WebGL-era text stacks (troika, three-bmfont-text) don't speak TSL node
materials, and runtime shapers ship megabytes you don't need for Latin UI
text. lettra covers the common case: a baked atlas, per-glyph metrics
with pairwise kerning, a small layout pass, and a composable node material.

## Install

```bash
pnpm add lettra three
```

`three >= 0.185` is an optional peer. The core entry (schema + layout) is
renderer-agnostic and runs anywhere, including Node.

## Quickstart

```ts
import { createText, loadFont, loadFontTexture, wipe } from 'lettra/three'

const [font, map] = await Promise.all([
  loadFont('/fonts/display.json'),
  loadFontTexture('/fonts/display.png'),
])

const text = createText({
  font,
  map,
  text: '¡Hola! Sharp at any scale.',
  layout: { align: 'center', maxWidth: 900 },
  material: { fill: '#e8e4da', effect: wipe() },
})
scene.add(text.mesh)

// compile the pipeline + upload the atlas off the hot path
await text.warmup(renderer, camera, scene)

text.setText('live string swap')                  // relayout, per keystroke is fine
text.uniforms.wipeIn.value = 0.5                  // tween 0 → 1 to reveal
```

### Effects

The base material is plain MSDF fill + opacity. Pre-made effects are opt-in
and tree-shakeable: pass one as `material.effect` and its uniforms merge into
`text.uniforms`, typed (`wipeIn` only exists if you passed `wipe()`). Skip
the import and the effect's shader code never reaches your bundle.

**`wipe({ band?, coord? })`** is a threshold-erosion dissolve, not a clip:
the fill threshold rises through the signed distance field, so glyph edges
dissolve first and stroke skeletons last, while the front sweeps across the
text's ink width (`layoutX`). Its `wipeIn` / `wipeOut` uniforms run 0 → 1
and sweep in the same direction: `wipeIn` reveals, `wipeOut` consumes.
Reuse one `wipe()` instance across several materials to share the uniforms.

Bake with distance range **8** (see below). Erosion needs SDF headroom;
shallow ranges make dissolves snap.

**`scramble({ font, chars?, rate?, drive?, capacity? })`** is the
decoder/terminal effect: while driven, a glyph renders a random glyph from
the same atlas instead, re-rolled `rate` times a second, by remapping the
sample into another glyph's atlas rect. `chars` picks the pool (default:
every glyph in the font); it reads best when the pool shares an ink box,
like monospace faces or same-height sets (A–Z0–9). Its `scramble` uniform
runs 0 → 1 and glyphs engage in stable random order along the way. `drive`
swaps the uniform for any per-fragment scalar field, or combines with it via
the callback form (see below). When you `swapFont`, call the effect's
`setPool(nextFont)` alongside.

**`composeEffects(...effects)`** stacks effects into one: uniforms merge,
`uv` remaps chain, erosions add. Typing carries through, so the composed
bag has every effect's uniforms.

```ts
// 1) plain scramble on a mono face
const text = createText({
  font,
  map,
  text: 'ACCESSING NODE 7F…',
  material: { fill: '#9ece6a', effect: scramble({ font, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&' }) },
})
text.uniforms.scramble.value = 1 // tween back to 0 to decode

// 2) everything at once: erosion wipe + scramble driven by the wipe's front,
// so glyphs touched by the sweeping edge scramble while they dissolve
import { attribute, float, max } from 'three/tsl'

const wipeFx = wipe({ band: 0.3 })
const erosion = wipeErosion({
  wipeIn: wipeFx.uniforms.wipeIn,
  wipeOut: wipeFx.uniforms.wipeOut,
  coord: attribute('layoutX', 'float'),
  band: float(0.3),
})
const touched = erosion.mul(erosion.oneMinus()).mul(4) // bell: peaks mid-dissolve
const effect = composeEffects(wipeFx, scramble({ font, drive: (knob) => max(knob, touched) }))
```

`drive` is the composition seam. `touched` above is just a scalar field, so
anything expressible as a node drives the scramble the same way: a liquid
surface's edge SDF sampled at world position, cursor proximity, an audio
level. Build the field, hand it to `drive`, done. The playground ships this
end to end: a cursor-following water trail whose rim scrambles a paragraph
and whose interior tints the ink wet
([templates/playground/src/gl/views/liquid.ts](./templates/playground/src/gl/views/liquid.ts)).

Effects are plain objects satisfying the `TextEffect` contract: a uniform
bag plus per-wire transforms. The graph has named wires resolved in a fixed
order (`uv`, `erosion`, `color`, `opacity`); an effect transforms the wires
it cares about, receiving the value so far and returning the new one, so
add vs replace is the effect's own node math. Composition chains transforms
left to right, and new wires land without breaking existing effects. Write
your own the same way `wipe` and `scramble` are written:

```ts
// recolor by any field — a first-class effect, composable with wipe()
const heat: TextEffect = {
  uniforms: {},
  stages: { color: (prev, { erosion }) => mix(prev, color('#e63946'), erosion) },
}
createTextMaterial({ map, effect: composeEffects(wipe(), heat) })
```

The scramble itself is three reusable contract nodes: `staggerGate`
(per-element random on/off under a sweeping drive), `cycleIndex`
(time-stepped random index), and `rectUv` (atlas sub-rect remap).

### Composing your own material

Every node in the default graph is exported and declared through a single
contract (`defineNode`): one declaration drives the TypeScript types *and* a
frozen `.definition` (name, input types, output type), so contract-driven
tooling like debug panels and node galleries can introspect without
importing material code. Extend instead of forking:

```ts
import { attribute, mix } from 'three/tsl'
import { buildTextGraph, createTextMaterial, createTextUniforms, wipe, wipeErosion } from 'lettra/three'

// per-line wipe instead of per-ink-width
createTextMaterial({ map, effect: wipe({ coord: attribute('lineIndex', 'float').div(lineCount) }) })

// own (or share) the uniform bag across several texts
const uniforms = createTextUniforms({ fill: '#e8e4da' })
createTextMaterial({ map, uniforms })

// every stage of the default material's graph is on `nodes` — feed any of
// them onward (bloom masks, particles, whatever takes a node)
const fx = wipe()
const { material, nodes } = createTextMaterial({ map, effect: fx })
sparks.opacityNode = nodes.erosion

// or skip the material: buildTextGraph returns the plain TSL stages
// (uv, textureNode, distance, aa, erosion?, threshold, coverage, color,
// opacity) and owns nothing — assign them to any NodeMaterial slot
const graph = buildTextGraph({ map, effect: fx })
myMaterial.opacityNode = graph.coverage

wipeErosion.definition
// → { name: 'wipeErosion', inputs: { wipeIn: 'float', wipeOut: 'float', coord: 'float', band: 'float' }, output: 'float' }
```

`buildTextGeometry` provides the animation hooks as vertex attributes:
`layoutX` (0→1 across ink width, per-vertex), `cellUv` (0→1 across each
glyph quad), `glyphIndex`, `lineIndex`.
Type consumer-side input bags with `NodeInputs<typeof wipeErosion>`.

### Lifecycle contract

- **`dispose()`** releases geometry, material, and (by default) the atlas.
  `material.dispose()` alone never frees textures; pass `{ map: false }`
  when atlases are shared.
- **`warmup(renderer, camera, scene?)`** forces atlas upload and one
  pipeline compile so the first visible frame doesn't hitch.
- **`swapFont({ font, map, text? })`** awaits nothing: load the texture
  first, then geometry and atlas rebind in one synchronous block. Swapping
  the texture a frame before the geometry flashes garbage; don't do it by
  hand, use this.
- **`onChange(cb)`** fires when rendered output changes (text set, font
  swapped, warmup done). Demand-driven render loops invalidate exactly one
  frame from it.

### Opaque-pass text

The default material is `transparent` with `depthWrite: false`. For text
that must write depth, flip it to alpha-to-coverage:

```ts
material.transparent = false
material.alphaToCoverage = true
material.alphaTestNode = float(0.5)
```

## Loading and warmup

lettra has no opinion about either. The quickstart's `fetch` +
`text.warmup()` is the whole contract, and both seams are plain promises.
This is how we wire them at [joyco.studio](https://joyco.studio):
[`@joycostudio/susano`](https://www.npmjs.com/package/@joycostudio/susano)
owns preload/load,
[`@joycostudio/xyz`](https://www.npmjs.com/package/@joycostudio/xyz) owns
warmup.

### Loading with susano

Susano caches one content fetch per URL and lets each call project its own
result, so the font JSON and atlas plug in as `postprocess` steps:

```ts
import { susano } from '@joycostudio/susano'
import { Texture } from 'three/webgpu'
import { parseFont } from 'lettra'
import { configureFontTexture, createText } from 'lettra/three'

const [font, map] = await Promise.all([
  susano.load('/fonts/display.json', {
    type: 'generic',
    loaderArgs: {
      loadFn: ({ url, done, error }) =>
        fetch(url).then((r) => r.json()).then(done).catch(error),
    },
    postprocess: parseFont,
  }),
  susano.load('/fonts/display.png', {
    type: 'image',
    postprocess: (img) => configureFontTexture(new Texture(img)),
  }),
])

const text = createText({ font, map, text: 'preloaded, deduped, tracked' })
```

Preloading is the same calls, earlier: fire them at route level and later
calls join the in-flight fetch instead of re-requesting. Put the same URLs
in a `susano.batch([...])` to drive a load screen; batches and loads share
content loaders, so nothing fetches twice. Fonts you'll `swapFont` to later
belong in that batch too.

### Warmup with xyz

`text.warmup(renderer, camera)` is the standalone path: one mesh, compiled
and uploaded off the hot path. In a real scene you want every pipeline and
texture warmed in one pass. That's xyz's `Warmup`: it discovers the scene's
full renderable graph, TSL node materials and their textures included, so
text meshes need no special registration:

```ts
import { Warmup } from '@joycostudio/xyz/three'

scene.add(text.mesh)

const warmup = new Warmup({
  pause: () => (clock.running = false),
  resume: () => (clock.running = true),
  initTexture: (t) => renderer.initTexture(t),
  compile: (scene, camera) => renderer.compileAsync(scene, camera),
  render: () => renderer.render(scene, camera),
  nextFrame: () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
})

await warmup.start(scene, camera) // covers text.warmup(), skip it
```

Two interactions worth knowing:

- **`swapFont` after warmup introduces a cold atlas.** `warmup.audit(scene)`
  flags it in dev. To keep swaps hitch-free, load every atlas up front (the
  susano batch above) and `renderer.initTexture(map)` each before first use.
- **`onChange` still fires on warmup completion**, whichever path warmed the
  text. Demand-driven loops invalidate one frame from it either way.

## Families and variants

A family declares its bakes next/font style and resolves CSS-like: an exact
hit serves its atlas, a weight with no bake serves its neighbour unmodified,
and an italic request with no italic bake gets a sheared oblique. Weight
search follows CSS Fonts 4: above 500 heavier bakes are tried first, below
400 lighter ones, and inside 400..500 the climb stops at 500 before falling
back to lighter. So with 400 and 700 baked, 450 serves the 400 and 550
serves the 700.

```ts
import { createText, defineFamily } from 'lettra/three'

const inter = defineFamily({
  src: [
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
  ],
})

// load is the only async point; weight 500 serves the 400 bake
const text = createText({ variant: await inter.load({ weight: 500 }), text: 'Hello' })
text.setVariant(await inter.load({ weight: 700, style: 'italic' })) // atomic swap

await inter.loadAll()            // or eager: everything sync via get() after
inter.get({ weight: 700 })       // sync, null until loaded
inter.has({ weight: 700 })       // true only for exact bakes
inter.warmup(renderer)           // uploads every loaded atlas
inter.dispose()                  // the family owns its atlases, texts never do
```

Weight is never synthesized: bake the weights you want. `synthesis: false`
makes any miss throw instead of resolving. Bake every variant of a family at
one size and distance range; `defineFamily` warns when loaded bakes
disagree.

## Italic spans inside one text

`createRichText` lays out one paragraph across several variants, so an
italic run inside a sentence is still a single layout: wrapping, alignment
and the baseline are paragraph-wide, not per span.

```ts
import { createRichText, defineFamily } from 'lettra/three'

await inter.loadAll()                     // spans resolve synchronously

const rich = createRichText({
  family: inter,
  text: 'one layout, regular to bold to italic',
  spans: [
    { start: 23, end: 27, weight: 700 },
    { start: 31, end: 37, style: 'italic' },
  ],
  layout: { align: 'center' },
})
scene.add(rich.group)
```

Spans carry the same `{ weight, style }` keys `family.load` takes, so they
resolve through the same CSS-like path, the synthetic oblique included. Gaps
between spans use the base `variant` key. Runs bucket by resolved variant,
so two italic spans cost one draw call, not two.

Worth knowing:

- Variants must be loaded first — `createRichText` resolves through the
  synchronous `family.get` and throws naming the missing weight and style.
- Kerning drops at span boundaries; the pair tables are per font. Adjacent
  runs resolving to the same bake are merged first, so a span that changes
  nothing does not cost you a pair.
- Spans must cover at least one character, and must not overlap.
- Mixed bake sizes normalise to the first run's font, and baselines align to
  the deepest one.
- Paragraph-wide effects (`wipe`) ride every bucket. An effect that declares
  `fontBound` (`scramble`, whose pool is rects of one font's atlas) rides only
  the buckets drawing the base variant's font, since elsewhere it would sample
  the wrong texture with those rects; the rest render without it.

## Baking fonts

Dev-time, one command. `npx lettra bake` preflights the font, instances
variable fonts to static weights with fontTools (Python; the step that
keeps GPOS kerning alive), bakes with pinned MSDF settings, recovers
class-based GPOS pairs that the generator's parser misses, and emits the
minified lettra JSON plus a ready `defineFamily` block:

```bash
npm i -D msdf-bmfont-xml  # the baker: an optional peer, so a browser-only install skips it
pip3 install fonttools    # required for variable fonts, recommended for any kerned face
npx lettra bake Inter.ttf --weights 400,700 --italic Inter-Italic.ttf \
  --charset latin-es --size 64 --pxrange 8 --out public/fonts/inter
```

`--out` is a path prefix, not a directory: `--out public/fonts/inter` writes
`public/fonts/inter-400.json` and prints it as `/fonts/inter-400.json`, the
URL it is actually served at under a standard public directory.

Manual routes still work: raw msdf-bmfont-xml, or the browser tool
[msdf-font-generator.leomouraire.com](https://msdf-font-generator.leomouraire.com).

`createText` (and `loadFont` / `parseFont`) accepts the raw BMFont JSON
directly, or run it through `fromBMFont` once and ship the minified schema
(~20× smaller: char-keyed glyph tuples, pair-keyed kerning, generator noise
stripped). Parsing is memoized by object identity and `loadFont` caches by
URL, so sharing one font across many texts parses once and shares one glyph
lookup cache.

Rules of thumb (the parser enforces the hard ones):

- **Single atlas page.** Multi-page bakes are rejected; raise the texture
  size instead.
- **No rotated glyph packing.**
- **`-r 8`** distance range, for AA quality and wipe headroom.
- Include **space and `?`** in the charset; they back the runtime fallbacks
  (missing characters render as `?`). Every preset does.
- **Check the kerning count** in the output. Variable fonts bake with **0
  pairs** when their kerning lives in variable GPOS; the generator's parser
  can't resolve the deltas, and Playfair Display loses all 2362 pairs this
  way. Instancing to a static weight first fully restores them:

  ```bash
  pip install fonttools   # or: pipx install fonttools / uv tool install fonttools
  python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf
  ```

  `parseFont` warns at runtime when a font arrives with an empty kerning
  table.
- Texture setup is handled by `loadFontTexture` / `configureFontTexture`:
  `flipY: false`, linear filters, **no mipmaps**, `NoColorSpace` (the atlas
  is data; sRGB decode would warp the distance field).

### Charsets

`--charset` takes a preset name, a file path, or a literal string:

```bash
npx lettra bake font.ttf --charset latin-es          # preset
npx lettra bake font.ttf --charset ./charset.txt     # file
npx lettra bake font.ttf --charset 'LETTRA 0123'     # literal, for a logotype
```

Presets are ASCII printable plus curly quotes, dashes and the ellipsis,
then the language's accents: `ascii`, `latin`, `latin-es`, `latin-pt`,
`latin-fr`, `latin-de`, `latin-ext` (all of them in one bake).

Characters the font has no glyph for are dropped with a warning rather than
baked. Without that check they pack as `.notdef` tofu, waste atlas space and
ship as boxes; dropping them lets the runtime's `?` fallback do its job.

## Layout

```ts
import { layout, parseFont } from 'lettra'

const result = layout(font, 'Hello\nworld', {
  align: 'center',        // against the widest line
  letterSpacing: 2,       // extra advance, baked px
  lineHeight: 72,         // overrides the baked value
  maxWidth: 900,          // enables greedy word wrap
  mode: 'greedy',         // 'pre' (only \n) | 'nowrap'
})
// → { glyphs: [{ x, y, w, h, u0..v1, index, line }], width, height, inkOrigin, metrics }
```

`width`/`height` are the **ink bounding box**, not font metrics: display
faces carry asymmetric lineHeight/baseline padding, and metric-centering
reads as misalignment. Line-box numbers live in `metrics`.

## Playground

```bash
pnpm install && pnpm --filter @templates/playground dev
```

Editable text, two switchable fonts (atomic swap check), wipe buttons, drag
to tilt, dpr ≤ 2. `?forceWebGL` exercises the WebGL2 fallback. See
[templates/playground](./templates/playground) for the font bake recipe.

## Non-goals

No complex shaping (Arabic, Indic, contextual ligatures), no CJK-scale
charsets, no color emoji, no bidi paragraphs. Those need a real shaper at
runtime; use [@pmndrs/glyph](https://github.com/pmndrs/glyph). lettra
is for Latin-script UI and display text that wants to be tiny and fast.

Known limit: `lettra/three` imports `three/webgpu`, which ships
ESM-only. The CJS build of that subpath exists but is only usable through
bundlers.

## Credits

- Layout engine ported (typed, char-keyed, O(1) kerning) from Jam3's
  [layout-bmfont-text](https://github.com/Jam3/layout-bmfont-text) and
  [word-wrapper](https://github.com/Jam3/word-wrapper) (MIT).
- MSDF reconstruction per [Chlumsky's msdfgen](https://github.com/Chlumsky/msdfgen),
  as documented in the [JOYCO toolbox](https://hub.joyco.studio/toolbox/msdfgen).
- Atlas generation: [msdf-bmfont-xml](https://github.com/soimy/msdf-bmfont-xml).

## License

ISC © [joyco.studio](https://joyco.studio)
