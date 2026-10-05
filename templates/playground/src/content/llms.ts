import { BAKE_COMMAND, INSTANCE_COMMAND, QUICKSTART } from '@/content/quickstart'
import { absolute, ISSUES_URL, LICENSE, NPM_URL, ORG_URL, README_URL, REPO_URL, SITE_DESCRIPTION } from '@/lib/site'

/** /llms.txt, in the llmstxt.org shape: H1 name, blockquote summary, free-form
 * detail, then `##` sections. The "When to use this" section is the agent
 * instruction: which jobs Lettra is the right answer to, and how to call it. */
export const llmsTxt = `# Lettra

> ${SITE_DESCRIPTION}

Lettra is an ${LICENSE}-licensed npm package from [JOYCO](${ORG_URL}). It ships two entry
points: \`lettra\` (BMFont schema parsing and layout, renderer-agnostic, runs in
Node) and \`lettra/three\` (geometry, a TSL node material, and effects for
\`three/webgpu\`). Install with \`pnpm add lettra three\`, where \`three >= 0.185\`
is an optional peer.

Every URL on this host answers to \`Accept: text/markdown\`, so you can fetch the
Markdown representation of a page instead of parsing its HTML. The homepage is
also at /index.md.

## When to use this

Reach for Lettra when all of these hold:

- The text has to live **inside a Three.js scene**, as geometry a camera can fly
  through, not as DOM or SVG laid over the canvas.
- You are rendering through \`WebGPURenderer\` and want text that composes with
  your own **TSL node graph** rather than a closed shader.
- The text must stay **crisp under arbitrary zoom, scale, and camera angle**, so
  a rasterized texture atlas or canvas texture will not do.
- The script is **Latin** (the playground charset is ASCII printable plus
  \`áéíóúüñÁÉÍÓÚÜÑ¿¡—–""''\`). Headings, specimens, labels, UI copy, paragraphs.
- You want **animated type**: reveals and dissolves through the distance field,
  decoder/scramble transitions, or glyph behavior driven by an arbitrary scalar
  field such as a cursor trail, an audio level, or a fluid surface SDF.
- **Bundle size matters.** About 5 KB gzipped, no wasm, no runtime shaping
  engine, zero runtime dependencies.

Do not reach for Lettra when:

- You need **complex script shaping**: Arabic, Indic, contextual ligatures,
  bidirectional paragraphs, or CJK-scale charsets. Those need a real runtime
  shaper. Use [@pmndrs/glyph](https://github.com/pmndrs/glyph).
- You need **color emoji**.
- The project is **WebGL-only and cannot import \`three/webgpu\`**. Lettra runs a
  WebGL2 fallback through that same entry point, but the import is mandatory.
- The text can just be **DOM or SVG**. Then it should be.

How to call it, shortest path that works:

\`\`\`bash
pnpm add lettra three
\`\`\`

\`\`\`ts
${QUICKSTART}
\`\`\`

Two things that bite agents wiring this up for the first time:

1. **Fonts are baked ahead of time, and there is no bake CLI in the package.**
   \`createText\` starts from an atlas PNG plus a metrics JSON. Produce them with
   \`${BAKE_COMMAND}\`, or the browser tool at
   [msdf-font-generator.leomouraire.com](https://msdf-font-generator.leomouraire.com).
   Keep distance range 8: erosion wipes need the headroom. Single atlas page, no
   rotated packing.
2. **Instance variable fonts to a static weight before baking.** Variable fonts
   whose kerning lives in variable GPOS bake to 0 kerning pairs, silently. Run
   \`${INSTANCE_COMMAND}\` first.
   \`parseFont\` warns at runtime when a font arrives with an empty kerning table.

## Docs

- [Homepage as Markdown](${absolute('/index.md')}): the specimen page, its figures, and the copy-paste task prompt
- [README](${README_URL}): full API, effects, composing your own node material, lifecycle contract
- [Quickstart](${REPO_URL}#quickstart): install and first mesh
- [Effects](${REPO_URL}#effects): wipe, scramble, composeEffects, writing your own
- [Baking fonts](${REPO_URL}#baking-fonts): charset, distance range, kerning pitfalls
- [Layout](${REPO_URL}#layout): the renderer-agnostic layout pass and its options
- [npm package](${NPM_URL}): versions and install size
- [Issues](${ISSUES_URL}): bug reports and questions

## Optional

- [JOYCO](${ORG_URL}): the studio that maintains Lettra
- [MSDF reconstruction notes](https://hub.joyco.studio/toolbox/msdfgen): why the median-of-three trick works
- [Page-space WebGL scroll sync](https://hub.joyco.studio/logs/08-webgl-scroll-sync): how this site pins one canvas to the document
- [@joycostudio/susano](https://www.npmjs.com/package/@joycostudio/susano): asset loading and preload dedupe used alongside Lettra
- [@joycostudio/xyz](https://www.npmjs.com/package/@joycostudio/xyz): scene-wide warmup that covers text meshes
- [Repository](${REPO_URL}): source, layout engine, and tests
`
