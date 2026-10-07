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
  'npx lettra bake font.ttf --weights 400,700 --italic italic.ttf --charset latin-es --size 64 --pxrange 8 --out public/fonts/name'

export const INSTANCE_COMMAND = 'python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf'

export const FAMILY_QUICKSTART = `import { createRichText, createText, defineFamily } from 'lettra/three'

const inter = defineFamily({
  src: [
    { json: '/fonts/inter-400.json', atlas: '/fonts/inter-400.png', weight: 400 },
    { json: '/fonts/inter-700.json', atlas: '/fonts/inter-700.png', weight: 700 },
    { json: '/fonts/inter-400i.json', atlas: '/fonts/inter-400i.png', weight: 400, style: 'italic' },
  ],
})

// nearest bake, sheared into an oblique only if no italic was baked
const heading = createText({ variant: await inter.load({ weight: 500, style: 'italic' }) })
heading.setVariant(await inter.load({ weight: 700 }))  // font + atlas + slant, one tick

// weight or italic spans inside a single paragraph-wide layout
await inter.loadAll()
const paragraph = createRichText({
  family: inter,
  text: 'one layout, regular to bold',
  spans: [{ start: 23, end: 27, weight: 700 }],
})
scene.add(paragraph.group)`
