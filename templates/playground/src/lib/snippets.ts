import type { SpecimenState } from '../gl/views/specimen'

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
import { mix, saturate, smoothstep, texture, float } from 'three/tsl'

// a tiny GPU fluid sim: one half-float ping-pong texture,
// rg = velocity, b = ink. Each frame: backtrace by velocity,
// damp + dissipate, splat the cursor stroke in as a capsule.
// (~30 lines of TSL -- see gl/views/liquid.ts for the pass)

// the dye texture read back out as a scalar field
const field = texture(sim.texture, simUv).b
const rim = saturate(float(1).sub(field.sub(0.4).abs().div(0.25)))
const wet = smoothstep(0.4, 0.8, field)

// interior wetness tints the ink through the color wire
const wetInk = { uniforms: {}, stages: { color: (prev) => mix(prev, color('#1d3557'), wet) } }

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

export const bakeRecipe = `# instance variable fonts first: variable GPOS kerning
# bakes to 0 pairs otherwise (static GPOS reads fine)
python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf

# bake: MSDF atlas PNG + BMFont JSON metrics
# -r 8 is the distance range, required for smooth erosion wipes
npx -y -p msdf-bmfont-xml msdf-bmfont \\
  -f json -i charset.txt -s 64 -r 8 -p 2 \\
  -t msdf --smart-size static.ttf`

/** Static code blocks highlighted server-side at build. */
export interface HighlightedSnippets {
  stage: string
  specimen: string
  bake: string
  wipe: string
  scramble: string
  liquid: string
}
