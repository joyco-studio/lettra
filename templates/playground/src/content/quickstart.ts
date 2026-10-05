/** The quickstart and bake commands, shared by the Markdown homepage,
 * llms.txt, and the copy-paste agent prompt so the three never drift. */

export const QUICKSTART = `import { createText, loadFont, loadFontTexture, wipe } from 'lettra/three'

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

text.setText('live string swap')  // relayout, per keystroke is fine
text.uniforms.wipeIn.value = 0.5  // tween 0 -> 1 to reveal`

export const BAKE_COMMAND =
  'npx -y -p msdf-bmfont-xml msdf-bmfont -f json -i charset.txt -s 64 -r 8 -p 2 -t msdf --smart-size font.ttf'

export const INSTANCE_COMMAND = 'python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf'
