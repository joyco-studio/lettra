import { BAKE_COMMAND, FAMILY_QUICKSTART } from '@/content/quickstart'
import { README_URL } from '@/lib/site'

/** The "copy agent prompt" payload. Rendered by the homepage button and
 * embedded in the Markdown representation so both stay in step. */
export const AGENT_PROMPT = `Add lettra (runtime MSDF text for Three.js WebGPURenderer + TSL) to this project.

Install: pnpm add lettra three   (three >= 0.185)

Quickstart:
import { createText, loadFont, loadFontTexture, wipe } from 'lettra/three'
const [font, map] = await Promise.all([loadFont('/fonts/display.json'), loadFontTexture('/fonts/display.png')])
const text = createText({ font, map, text: 'Hello', layout: { align: 'center' }, material: { fill: '#414141', effect: wipe() } })
scene.add(text.mesh)
await text.warmup(renderer, camera, scene) // pipeline compile + atlas upload off the hot path
text.uniforms.wipeIn.value = 1 // tween 0 -> 1 to reveal; wipeOut consumes

Fonts are baked once at build time with the bundled CLI (it instances variable fonts and recovers GPOS kerning):
${BAKE_COMMAND}
Weight/style variants compose into a family:
${FAMILY_QUICKSTART}
- keep distance range 8 (erosion wipes need the SDF headroom), single atlas page, no rotated packing

Full API (layout engine, effects, composing TSL nodes, lifecycle contract): ${README_URL}`
