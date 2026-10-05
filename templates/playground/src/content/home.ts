import { AGENT_PROMPT } from '@/content/agent-prompt'
import { BAKE_COMMAND, INSTANCE_COMMAND, QUICKSTART } from '@/content/quickstart'
import { absolute, ISSUES_URL, LICENSE, NPM_URL, ORG_URL, README_URL, REPO_URL } from '@/lib/site'

/** Markdown representation of the homepage, served for `Accept: text/markdown`
 * and at /index.md. It carries the same claims and figures as the HTML page
 * with the WebGPU canvas stripped, which is the part an agent cannot read. */
export const homeMarkdown = `# Lettra: sharp text, baked flat

Lettra renders live, kerned typography on the GPU from a font baked once into a
multi-channel signed distance field. No runtime shaper, no wasm: a few kilobytes
of layout and a composable Three.js node material, sharp at any scale and any
angle.

- Package: [\`lettra\`](${NPM_URL}) on npm, ${LICENSE} licensed, by [JOYCO](${ORG_URL})
- Source and full API: [${REPO_URL}](${README_URL})
- Renderer: \`three/webgpu\` \`WebGPURenderer\` + TSL, with a WebGL2 fallback
- Scope: Latin-script UI and display text, single or multiline, live string swap

## Getting started

\`\`\`bash
pnpm add lettra three
\`\`\`

\`three >= 0.185\` is an optional peer. The core entry (schema + layout) is
renderer-agnostic and runs anywhere, including Node.

\`\`\`ts
${QUICKSTART}
\`\`\`

### Task prompt

The homepage offers this as a one-click "copy agent prompt". It is the whole
integration brief, reproduced here so an agent reading Markdown gets the same
thing a human gets from the button:

\`\`\`text
${AGENT_PROMPT}
\`\`\`

## How it works

**Bake once.** A font becomes a small PNG atlas and a metrics JSON: each glyph a
multi-channel distance field, each kerning pair carried over. It happens at
build time, by hand or script. The library starts where the bake ends.

\`\`\`bash
${BAKE_COMMAND}
\`\`\`

**Lay out on the CPU.** A typed port of the classic BMFont pen walk: pairwise
kerning, greedy word wrap, alignment, letter-spacing. Bounds come from the ink
itself rather than font metrics, so display faces center the way they look, not
the way their line boxes claim.

**Reconstruct on the GPU.** The material takes the median of three channels,
sharpens it over half a derivative's width, and exposes erosion wipes that
dissolve glyphs through the distance field, edges first and stroke skeletons
last. Every node is exported, typed, and replaceable.

### Bake rules the parser enforces

- Single atlas page. Multi-page bakes are rejected; raise the texture size.
- No rotated glyph packing.
- Distance range \`-r 8\`, for AA quality and erosion headroom.
- Include space and \`?\` in the charset; they back the runtime fallbacks.
- Check the kerning count. Variable fonts bake with 0 pairs when their kerning
  lives in variable GPOS. \`npx lettra bake\` instances them first, which is what
  keeps the pairs; baking by hand means running
  \`${INSTANCE_COMMAND}\` yourself.

## Families and italics

\`\`\`ts
import { createRichText, createText, defineFamily } from 'lettra/three'

const inter = defineFamily({
  src: [
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
  ],
})

const text = createText({ variant: await inter.load({ weight: 500 }), text: 'Hello' })
text.setVariant(await inter.load({ weight: 700, style: 'italic' }))
\`\`\`

Resolution is CSS-like: an exact hit serves its atlas, a weight in between
serves the closest bake unmodified, and an italic request with no italic bake
gets a sheared one. Weight itself is never synthesized: bake the weights you
want.

\`createRichText({ family, text, spans })\` puts several variants in one
paragraph, so an italic or bold run inside a sentence keeps the paragraph's
wrapping, alignment and baseline. Spans take the same \`{ weight, style }\` keys
and bucket by resolved variant, so repeated spans share a draw call.

## Effects

The base material is plain MSDF fill + opacity. Effects are opt-in and
tree-shakeable: pass one as \`material.effect\` and its uniforms merge into
\`text.uniforms\`, typed. Skip the import and its shader code never reaches
your bundle.

- \`wipe({ band?, coord? })\` is a threshold-erosion dissolve, not a clip. Glyph
  edges dissolve first and stroke skeletons last while the front sweeps across
  the ink width. \`wipeIn\` reveals, \`wipeOut\` consumes, both 0 -> 1.
- \`scramble({ font, chars?, rate?, drive?, capacity? })\` is the decoder effect.
  A glyph renders a random glyph from the same atlas, re-rolled \`rate\` times a
  second. Reads best when the pool shares an ink box, like monospace faces.
- \`composeEffects(...effects)\` stacks effects into one: uniforms merge, \`uv\`
  remaps chain, erosions add, typing carries through.

\`drive\` is the composition seam. Anything expressible as a TSL node drives an
effect: a liquid surface's edge SDF, cursor proximity, an audio level. The
homepage ships this end to end as a cursor-following water trail whose rim
scrambles a paragraph and whose interior tints the ink wet.

## Layout

\`\`\`ts
import { layout, parseFont } from 'lettra'

const result = layout(font, 'Hello\\nworld', {
  align: 'center',      // against the widest line
  letterSpacing: 2,     // extra advance, baked px
  lineHeight: 72,       // overrides the baked value
  maxWidth: 900,        // enables greedy word wrap
  mode: 'greedy',       // 'pre' (only \\n) | 'nowrap'
})
// -> { glyphs: [{ x, y, w, h, u0..v1, index, line }], width, height, inkOrigin, metrics }
\`\`\`

\`width\` and \`height\` are the ink bounding box, not font metrics. Line-box
numbers live in \`metrics\`.

## Lifecycle contract

- \`dispose()\` releases geometry, material, and by default the atlas. Pass
  \`{ map: false }\` when atlases are shared.
- \`warmup(renderer, camera, scene?)\` forces atlas upload and one pipeline
  compile so the first visible frame does not hitch.
- \`swapFont({ font, map, text? })\` rebinds geometry and atlas in one
  synchronous block. Load the texture first.
- \`onChange(cb)\` fires when rendered output changes. Demand-driven render loops
  invalidate exactly one frame from it.

## Non-goals

No complex shaping (Arabic, Indic, contextual ligatures), no CJK-scale charsets,
no color emoji, no bidi paragraphs. Those need a real shaper at runtime; use
[@pmndrs/glyph](https://github.com/pmndrs/glyph) instead. Lettra is for
Latin-script UI and display text that wants to be tiny and fast.

Known limit: \`lettra/three\` imports \`three/webgpu\`, which ships ESM-only. The
CJS build of that subpath exists but is only usable through bundlers.

## This site

Every figure on the homepage is ink on one shared WebGPU canvas in page space,
scroll-synced to the document. Append \`?forceWebGL\` to exercise the WebGL2
fallback. Specimen faces: Bebas Neue and Lora, OFL. Layout ported from Jam3's
layout-bmfont-text (MIT).

Machine-readable entry points:

- [${absolute('/llms.txt')}](${absolute('/llms.txt')}) covers when to reach for Lettra and how to call it
- [${absolute('/index.md')}](${absolute('/index.md')}) is this document at a stable URL
- [${absolute('/sitemap.xml')}](${absolute('/sitemap.xml')})
- Any URL on this host answers to \`Accept: text/markdown\`

${LICENSE} © [joyco.studio](${ORG_URL}). Bugs and questions: [${ISSUES_URL}](${ISSUES_URL}).
`
