import { PerspectiveCamera, Scene } from 'three/webgpu'
import { createRichText } from 'lettra/three'
import type { RichSpan, VariantKey } from 'lettra/three'
import type { Stage } from '../stage'
import { frameText } from '../stage'

export interface RichTextState {
  text: string
  spans: RichSpan[]
  align: 'left' | 'center'
}

/** Run and draw-call counts for the DOM readout: the whole point of bucketing
 * is that the second number stays small. */
export interface RichTextInfo {
  runs: number
  draws: number
}

export interface RichTextView {
  apply(state: RichTextState): RichTextInfo | null
  dispose(): void
}

export const RICH_TEXT =
  'One paragraph, one layout: a word set in bold, another in italic, and a measure that wraps across all of them.'

/** In the bake's px (every Inter variant is baked at 64), so the sentence
 * wraps and the spans straddle the breaks. */
export const RICH_MEASURE = 1150

/** Offsets by word, so a preset cannot silently land on the wrong characters. */
const word = (text: string, key: VariantKey = {}): RichSpan => {
  const start = RICH_TEXT.indexOf(text)
  if (start < 0) throw new Error(`[playground] "${text}" is not in the rich-text sentence`)
  return { ...key, start, end: start + text.length }
}

/** Starting points for the editor, not the whole story: the figure lets you
 * draw your own. */
export const SPAN_PRESETS: Array<{ label: string; spans: RichSpan[] }> = [
  { label: 'none', spans: [] },
  { label: 'bold', spans: [word('bold', { weight: 700 })] },
  { label: 'bold + italic', spans: [word('bold', { weight: 700 }), word('italic', { style: 'italic' })] },
  {
    label: 'repeated',
    spans: [
      word('One paragraph', { style: 'italic' }),
      word('bold', { weight: 700 }),
      word('italic', { style: 'italic' }),
    ],
  },
]

/** fig. 03: weight and italic spans inside one paragraph, drawing from the
 * same stage-owned family as fig. 02. */
export async function createRichTextView(stage: Stage, el: HTMLElement, initial: RichTextState): Promise<RichTextView> {
  const scene = new Scene()
  const camera = new PerspectiveCamera(35, 1, 0.1, 100)
  camera.position.z = 10

  const inter = stage.inter
  // the stage owns the family, so only what this view made is in here
  const created: Array<() => void> = []
  const teardown = () => {
    for (const dispose of [...created].reverse()) dispose()
  }
  let disposed = false

  try {
    // spans resolve through the synchronous family.get, so every variant one
    // can ask for has to be loaded before the first build
    await inter.loadAll()
    inter.warmup(stage.renderer)

    const rich = createRichText({
      family: inter,
      text: initial.text,
      spans: initial.spans,
      layout: { align: initial.align, maxWidth: RICH_MEASURE },
      material: { fill: '#414141' },
    })
    created.push(() => rich.dispose())
    scene.add(rich.group)

    const frame = () => {
      frameText(camera, {
        width: rich.layout.width,
        height: rich.layout.height,
        fontSize: rich.layout.metrics.fontSize,
      })
      handle.invalidate()
    }

    const handle = stage.addView(el, {
      scene,
      camera,
      resize(width, height) {
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        frame()
      },
    })
    created.push(() => handle.dispose())
    rich.onChange(() => handle.invalidate())

    await rich.warmup(stage.renderer, camera, scene)
    frame()

    return {
      apply(next) {
        if (disposed) return null
        // one call re-spans and re-lays out: wrapping, alignment and the
        // baseline stay paragraph-wide across the new runs
        rich.setText(next.text, next.spans, { align: next.align, maxWidth: RICH_MEASURE })
        frame()
        return { runs: rich.layout.runs.length, draws: rich.group.children.length }
      },
      dispose() {
        if (disposed) return
        disposed = true
        teardown()
      },
    }
  } catch (error) {
    teardown()
    throw error
  }
}
