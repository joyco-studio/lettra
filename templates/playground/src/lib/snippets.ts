import type { SpecimenState } from '../gl/views/specimen'
import type { FamilyState } from '../gl/views/family'
import { RICH_MEASURE } from '../gl/views/rich-text'
import type { RichTextState } from '../gl/views/rich-text'

/** The code a consumer would write to reproduce the current specimen state. */
export function specimenSnippet(state: SpecimenState): string {
  const layout: string[] = [`align: '${state.align}'`]
  if (state.letterSpacing !== 0) layout.push(`letterSpacing: ${state.letterSpacing}`)
  if (state.lineHeight > 0) layout.push(`lineHeight: ${state.lineHeight}`)
  if (state.maxWidth > 0) layout.push(`maxWidth: ${state.maxWidth}`)

  return `import { createText, loadFont, loadFontTexture } from 'lettra/three'

const [font, map] = await Promise.all([
  loadFont('/fonts/${state.font}.json'),
  loadFontTexture('/fonts/${state.font}.png'),
])

const text = createText({
  font,
  map,
  text: ${JSON.stringify(state.text)},
  layout: { ${layout.join(', ')} },
  material: { fill: '#414141' },
})
scene.add(text.mesh)

// pipeline compile + atlas upload off the hot path
await text.warmup(renderer, camera, scene)`
}

export const wipeSnippet = `import { createText, wipe } from 'lettra/three'

const text = createText({
  font,
  map,
  text: 'EDGES FIRST,\\nBONES LAST.',
  layout: { align: 'center' },
  // band: dissolve front width, in wipe-coordinate units
  material: { fill: '#414141', effect: wipe({ band: 0.35 }) },
})

// the effect contributes two uniforms; tween 0 -> 1
text.uniforms.wipeIn.value = 0  // 0 hidden, 1 fully revealed
text.uniforms.wipeOut.value = 0 // 0 untouched, 1 fully consumed

// erosion dissolves glyphs through the distance field:
// thin edges give way first, stroke skeletons hold out last`

export const scrambleSnippet = `import { createText, scramble } from 'lettra/three'

const effect = scramble({
  font,                 // pool source: same font the text renders with
  chars: 'A-Z0-9',      // pool shares one ink box for the cleanest flicker
  rate: 14,             // glyph re-rolls per second
})

const text = createText({
  font,
  map,
  text: 'DECODING\\nTHE ATLAS',
  layout: { align: 'center' },
  material: { fill: '#414141', effect },
})

// 0 clean, 1 everything scrambles; glyphs engage
// in stable random order in between; tween it down to decode
text.uniforms.scramble.value = 1`

export const liquidSnippet = `import { composeEffects, createText, scramble } from 'lettra/three'
import type { TextEffect } from 'lettra/three'
import { color, max, mix, saturate, smoothstep, texture, float } from 'three/tsl'

// a tiny GPU flow field: one half-float ping-pong texture,
// rg = flow, b = ink. Each frame: the flow fades in place, the
// ink drifts along it and fades, the cursor stroke splats in.
// (~30 lines of TSL -- see gl/views/liquid.ts for the pass)

// the ink read back out as a scalar field
const field = texture(sim.texture, simUv).b
const rim = saturate(float(1).sub(field.sub(0.4).abs().div(0.25)))
const wet = smoothstep(0.4, 0.8, field)

// interior wetness tints the ink through the color wire
const wetInk: TextEffect = {
  uniforms: {},
  stages: { color: (prev) => mix(prev, color('#454a52'), wet) },
}

const text = createText({
  font,
  map,
  text: paragraph,
  layout: { align: 'left', maxWidth: 2400 },
  // glyphs touched by the ink's rim re-roll; the knob still works
  material: {
    effect: composeEffects(scramble({ font, drive: (knob) => max(knob, rim) }), wetInk),
  },
})

// the sim is view code, not library code -- swap it for a wipe
// front or an audio level and nothing else changes`

/** The code a consumer would write to reproduce the family figure at its
 * current weight and style. */
export function familySnippet(state: FamilyState): string {
  const key = state.style === 'italic' ? `{ weight: ${state.weight}, style: 'italic' }` : `{ weight: ${state.weight} }`
  return `import { createText, defineFamily } from 'lettra/three'

// next/font-style declaration; bakes come from \`npx lettra bake\`
const inter = defineFamily({
  src: [
    { json: '/fonts/inter-200.json', atlas: '/fonts/inter-200.png', weight: 200 },
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
    { json: '/fonts/inter-700i.json', atlas: '/fonts/inter-700i.png', weight: 700, style: 'italic' },
  ],
})

// CSS-like resolution: the closest bake serves, and an italic
// request with no italic bake gets a sheared oblique
const variant = await inter.load(${key})
const text = createText({
  variant,
  text: 'Sphinx of black quartz,\\njudge my vow',
  layout: { align: 'center' },
})
scene.add(text.mesh)

// weight changes ride the atomic swapFont path
text.setVariant(await inter.load({ weight: 700 }))`
}

/** The spans as the figure currently holds them, printed as the literals a
 * consumer would write. */
function printSpans(spans: RichTextState['spans']): string {
  if (spans.length === 0) return '[]'
  const lines = spans.map((span) => {
    const key = [`start: ${span.start}`, `end: ${span.end}`]
    if (span.weight !== undefined) key.push(`weight: ${span.weight}`)
    if (span.style === 'italic') key.push(`style: 'italic'`)
    return `    { ${key.join(', ')} },`
  })
  return `[\n${lines.join('\n')}\n  ]`
}

/** The code behind the rich-text figure in its current state. */
export function richTextSnippet(state: RichTextState): string {
  return `import { createRichText, defineFamily } from 'lettra/three'

// the same family the families panel declares
const inter = defineFamily({
  src: [
    { json: '/fonts/inter-200.json', atlas: '/fonts/inter-200.png', weight: 200 },
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
    { json: '/fonts/inter-700i.json', atlas: '/fonts/inter-700i.png', weight: 700, style: 'italic' },
  ],
})

// spans resolve through the synchronous family.get, so every variant one
// can ask for has to be loaded before the first build
await inter.loadAll()

const text = ${JSON.stringify(state.text)}

const rich = createRichText({
  family: inter,
  text,
  spans: ${printSpans(state.spans)},
  // paragraph-wide: the measure wraps across runs, and every run sits on
  // the same baseline
  layout: { align: '${state.align}', maxWidth: ${RICH_MEASURE} },
})
scene.add(rich.group)

// one mesh per resolved variant, under one Group: repeated spans share a
// draw call, and the uniform bag is shared across all of them
rich.group.children.length

// re-span and re-lay out in a single call
rich.setText(text, ${printSpans(state.spans)}, { align: '${state.align}', maxWidth: ${RICH_MEASURE} })`
}

export const bakeRecipe = `# one command: sfnt preflight, fontTools instancing
# (variable GPOS kerning survives), pinned MSDF settings,
# lettra-native JSON, a ready defineFamily src block
npx lettra bake Inter.ttf --weights 200,400,700 \\
  --italic Inter-Italic.ttf --charset latin-es \\
  --size 64 --pxrange 8 --out public/fonts/inter
`

/** Static code blocks highlighted server-side at build. */
export interface HighlightedSnippets {
  stage: string
  specimen: string
  bake: string
  wipe: string
  scramble: string
  liquid: string
}
