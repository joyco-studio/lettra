import { useEffect, useRef, useState } from 'react'
import { useObserve } from '@joycostudio/metri/react'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  Caption,
  ControlBar,
  ControlCell,
  ControlValue,
  FigCaption,
  Prose,
  Row,
  Segment,
  SnippetPanel,
} from '@/components/layout'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { specimenSnippet, wipeSnippet, scrambleSnippet, liquidSnippet } from '@/lib/snippets'
import type { FontName, Stage } from '@/gl/stage'
import { createSpecimenView } from '@/gl/views/specimen'
import type { Align, SpecimenState } from '@/gl/views/specimen'
import { createWipeView } from '@/gl/views/wipe'
import { createScrambleView } from '@/gl/views/scramble'
import { createLiquidView } from '@/gl/views/liquid'

/** Owns one tracked view on the shared stage: creates it when the stage is
 * ready, disposes it (or the late-arriving promise) on unmount. */
function useGLView<V extends { dispose(): void }>(
  stage: Stage | null,
  elRef: React.RefObject<HTMLDivElement | null>,
  create: (stage: Stage, el: HTMLElement) => Promise<V>
): V | null {
  const [view, setView] = useState<V | null>(null)
  const createRef = useRef(create)
  createRef.current = create

  useEffect(() => {
    const el = elRef.current
    if (!stage || !el) return
    let disposed = false
    let current: V | null = null
    createRef.current(stage, el).then((created) => {
      if (disposed) {
        created.dispose()
        return
      }
      current = created
      setView(created)
    })
    return () => {
      disposed = true
      current?.dispose()
      setView(null)
    }
  }, [stage, elRef])

  return view
}

/** Fire an effect once, the first time the placeholder is meaningfully on
 * screen and its view exists. */
function usePlayOnEnter(visible: boolean, ready: boolean, play: () => void) {
  const played = useRef(false)
  useEffect(() => {
    if (visible && ready && !played.current) {
      played.current = true
      play()
    }
  }, [visible, ready, play])
}

const INITIAL: SpecimenState = {
  text: 'AVATAR WAVE To.\n¡Sójy! — á la WebGPU',
  font: 'bebas',
  align: 'center',
  letterSpacing: 0,
  maxWidth: 0,
}

const FONTS: { name: FontName; label: string }[] = [
  { name: 'bebas', label: 'Bebas' },
  { name: 'lora', label: 'Lora' },
]

const ALIGNS: Align[] = ['left', 'center', 'right']

export function SpecimenExample({ stage }: { stage: Stage | null }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState(INITIAL)
  const [open, setOpen] = useState(true)
  const view = useGLView(stage, elRef, (s, el) => createSpecimenView(s, el, INITIAL))

  useEffect(() => {
    view?.apply(state)
  }, [state, view])

  const patch = (partial: Partial<SpecimenState>) => setState((previous) => ({ ...previous, ...partial }))

  return (
    <Row
      id="specimen"
      className="pt-16"
      asideClassName="lg:pt-16"
      aside={
        <SnippetPanel
          open={open}
          title="usage.ts"
          code={specimenSnippet(state)}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <figure>
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <ControlBar>
            <ControlCell label="font">
              {FONTS.map(({ name, label }) => (
                <Segment key={name} active={state.font === name} onClick={() => patch({ font: name })}>
                  {label}
                </Segment>
              ))}
            </ControlCell>
            <ControlCell label="align">
              {ALIGNS.map((align) => {
                const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
                return (
                  <Segment key={align} title={align} active={state.align === align} onClick={() => patch({ align })}>
                    <Icon size={13} strokeWidth={2.25} />
                  </Segment>
                )
              })}
            </ControlCell>
            <ControlCell label="wipe">
              <Segment onClick={() => view?.wipe('in')}>in</Segment>
              <Segment onClick={() => view?.wipe('out')}>out</Segment>
            </ControlCell>
            <ControlCell label="tracking" grow>
              <Slider
                value={[state.letterSpacing]}
                min={-4}
                max={24}
                step={1}
                className="min-w-16 flex-1"
                onValueChange={([value]) => patch({ letterSpacing: value })}
              />
              <ControlValue>{state.letterSpacing}px</ControlValue>
            </ControlCell>
            <ControlCell label="measure" grow>
              <Slider
                value={[state.maxWidth]}
                min={0}
                max={1600}
                step={20}
                className="min-w-16 flex-1"
                onValueChange={([value]) => patch({ maxWidth: value })}
              />
              <ControlValue>{state.maxWidth > 0 ? state.maxWidth : 'off'}</ControlValue>
            </ControlCell>
          </ControlBar>
          <div ref={elRef} className="aspect-[16/10] w-full cursor-grab touch-none active:cursor-grabbing" />
          <label className="flex items-start gap-3 bg-paper px-3 py-2.5">
            <span className="pt-[3px] font-mono text-[10px] font-medium tracking-[0.02em] text-ink-faint">text</span>
            <Textarea
              value={state.text}
              spellCheck={false}
              rows={2}
              className="min-h-0 flex-1 resize-none border-0 bg-transparent p-0 font-mono text-[13px] leading-[1.6] tracking-[0.02em] text-ink shadow-none focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => patch({ text: event.target.value })}
            />
          </label>
        </div>

        <figcaption className="mt-5">
          <FigCaption>fig. 01 — live specimen · drag to tilt</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function WipeExample({ stage, html }: { stage: Stage | null; html: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const view = useGLView(stage, elRef, createWipeView)
  const { visible } = useObserve(elRef, { threshold: 0.5 })
  usePlayOnEnter(visible, view !== null, () => view?.wipe('in'))

  return (
    <Row
      id="wipe"
      className="pt-20"
      asideClassName="lg:pt-20"
      aside={
        <SnippetPanel open={open} title="wipe.ts" code={wipeSnippet} html={html} onToggle={() => setOpen((value) => !value)} />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Erosion wipes</h2>
        <Caption>[effect]</Caption>
      </div>
      <Prose className="mt-5">
        The wipe never masks — it erodes. A front sweeps the ink and raises the distance threshold as it passes, so thin
        edges give way first and stroke skeletons hold out last, every glyph dissolving through its own field.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <div ref={elRef} className="aspect-[16/7] w-full" />
          <ControlBar>
            <ControlCell label="wipe">
              <Segment onClick={() => view?.wipe('in')}>in</Segment>
              <Segment onClick={() => view?.wipe('out')}>out</Segment>
            </ControlCell>
          </ControlBar>
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 02 — threshold erosion · plays as it enters</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function ScrambleExample({ stage, html }: { stage: Stage | null; html: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(0)
  const view = useGLView(stage, elRef, createScrambleView)
  const { visible } = useObserve(elRef, { threshold: 0.5 })
  usePlayOnEnter(visible, view !== null, () => view?.decode())

  return (
    <Row
      id="scramble"
      className="pt-20"
      asideClassName="lg:pt-20"
      aside={
        <SnippetPanel
          open={open}
          title="scramble.ts"
          code={scrambleSnippet} html={html}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Glyph scramble</h2>
        <Caption>[effect]</Caption>
      </div>
      <Prose className="mt-5">
        While driven, a glyph renders a random same-font glyph instead, re-rolled a few times a second — the decoder
        effect, straight from the atlas. Glyphs engage in stable random order, so sweeping the drive down decodes the
        line letter by letter.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <div ref={elRef} className="aspect-[16/7] w-full" />
          <ControlBar>
            <ControlCell>
              <Segment onClick={() => view?.decode()}>decode</Segment>
            </ControlCell>
            <ControlCell label="drive" grow>
              <Slider
                value={[amount]}
                min={0}
                max={100}
                step={1}
                className="min-w-16 max-w-[220px] flex-1"
                onValueChange={([value]) => {
                  setAmount(value)
                  view?.setAmount(value / 100)
                }}
              />
              <ControlValue>{amount}%</ControlValue>
            </ControlCell>
          </ControlBar>
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 03 — atlas scramble · decodes as it enters</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function LiquidExample({ stage, html }: { stage: Stage | null; html: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useGLView(stage, elRef, createLiquidView)

  return (
    <Row
      id="liquid"
      className="pt-20"
      asideClassName="lg:pt-20"
      aside={
        <SnippetPanel open={open} title="liquid.ts" code={liquidSnippet} html={html} onToggle={() => setOpen((value) => !value)} />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Water writes</h2>
        <Caption>[composition]</Caption>
      </div>
      <Prose className="mt-5">
        The scramble&apos;s drive is just a scalar field, so anything can hold the pen. Here it&apos;s a small GPU fluid
        sim: ink splatted along the cursor stroke, advected by its own velocity, dissipating as it goes — it swirls
        while you move and soaks away when you stop. Glyphs touched by its rim re-roll through the atlas, the wet
        interior darkens the ink, and none of it is library code. An audio level or a wipe front plugs into the same
        seam.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <div ref={elRef} className="aspect-[16/8] w-full touch-none" />
          <ControlBar>
            <ControlCell label="move the cursor across the text" />
          </ControlBar>
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 04 — fluid-sim ink driving the scramble</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}
