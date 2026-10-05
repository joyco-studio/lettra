import type { SpecimenState } from '../gl/views/specimen'
import type { FamilyState } from '../gl/views/family'

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

// a tiny GPU fluid sim: one half-float ping-pong texture,
// rg = velocity, b = ink. Each frame: backtrace by velocity,
// damp + dissipate, splat the cursor stroke in as a capsule.
// (~30 lines of TSL -- see gl/views/liquid.ts for the pass)

// the dye texture read back out as a scalar field
const field = texture(sim.texture, simUv).b
const rim = saturate(float(1).sub(field.sub(0.4).abs().div(0.25)))
const wet = smoothstep(0.4, 0.8, field)

// interior wetness tints the ink through the color wire
const wetInk: TextEffect = {
  uniforms: {},
  stages: { color: (prev) => mix(prev, color('#1d3557'), wet) },
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

/** The code a consumer would write to reproduce the family figure. */
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

// CSS-like resolution: nearest bake + synthetic corrections
// (threshold-shift bold, sheared oblique) cover the misses
const variant = await inter.load(${key})
const text = createText({ variant, text, layout })

// weight changes ride the atomic swapFont path
text.setVariant(await inter.load({ weight: 700 }))`
}

export const bakeRecipe = `# one command: sfnt preflight, fontTools instancing
# (variable GPOS kerning survives), pinned MSDF settings,
# lettra-native JSON, a ready defineFamily src block
npx lettra bake Inter.ttf --weights 400,700 \\
  --italic Inter-Italic.ttf --charset latin-es \\
  --size 64 --pxrange 8 --out public/fonts/inter
`

export const richTextSnippet = `import { createRichText, defineFamily } from 'lettra/three'

const inter = defineFamily({
  src: [
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
  ],
})

// spans resolve through the family, so an italic run inside a sentence is
// one layout: wrapping, alignment and the baseline stay paragraph-wide
await inter.loadAll()

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

// one mesh per distinct variant, so two italic spans still cost one draw`

/** Static code blocks highlighted server-side at build. */
export interface HighlightedSnippets {
  stage: string
  specimen: string
  bake: string
  wipe: string
  scramble: string
  liquid: string
}
