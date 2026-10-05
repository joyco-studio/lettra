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
import { familySnippet, specimenSnippet, wipeSnippet, scrambleSnippet, liquidSnippet } from '@/lib/snippets'
import type { FontName, Stage } from '@/gl/stage'
import { createSpecimenView } from '@/gl/views/specimen'
import type { Align, SpecimenState } from '@/gl/views/specimen'
import { createFamilyView } from '@/gl/views/family'
import type { FamilyInfo, FamilyState } from '@/gl/views/family'
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
  text: 'I am Sir Fabroos\nThe destroyer of bugs',
  font: 'respira',
  align: 'center',
  letterSpacing: 0,
  lineHeight: 0,
  maxWidth: 0,
}

const FONTS: { name: FontName; label: string }[] = [
  { name: 'respira', label: 'Respira' },
  { name: 'bebas', label: 'Bebas' },
  { name: 'lora', label: 'Lora' },
]

/** Per-font default copy. The Respira trial cut only inks A-Z a-z 0-9 and
 * the period (54 husk glyphs stripped, including ?), so its line sticks to
 * that coverage — switching fonts swaps the default only if the text is
 * still a default, never clobbering user edits. */
const DEFAULT_TEXT: Record<FontName, string> = {
  bebas: INITIAL.text,
  lora: INITIAL.text,
  respira: INITIAL.text,
  roboto: INITIAL.text,
  lettra: INITIAL.text,
}

const ALIGNS: Align[] = ['left', 'center', 'right']

// leading floor ≈ cap height; the slider's lowest stop stands in for 0 = baked
const LEADING_MIN = 60
const LEADING_BAKED = LEADING_MIN - 2

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
                <Segment
                  key={name}
                  active={state.font === name}
                  onClick={() =>
                    patch({
                      font: name,
                      ...(state.text === DEFAULT_TEXT[state.font] ? { text: DEFAULT_TEXT[name] } : {}),
                    })
                  }
                >
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
            <ControlCell label="leading" grow>
              <Slider
                value={[state.lineHeight === 0 ? LEADING_BAKED : state.lineHeight]}
                min={LEADING_BAKED}
                max={160}
                step={2}
                className="min-w-16 flex-1"
                onValueChange={([value]) => patch({ lineHeight: value <= LEADING_BAKED ? 0 : value })}
              />
              <ControlValue>{state.lineHeight > 0 ? `${state.lineHeight}px` : 'baked'}</ControlValue>
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
          <FigCaption>fig. 01 · live specimen · drag to tilt</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

const FAMILY_INITIAL: FamilyState = { weight: 400, style: 'normal' }
/** The weights actually baked; the slider magnetizes to these so exact hits
 * are reachable by drag. */
const BAKED_STOPS = [200, 400, 700]

export function FamilyExample({ stage }: { stage: Stage | null }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState(FAMILY_INITIAL)
  const [info, setInfo] = useState<FamilyInfo | null>(null)
  const [open, setOpen] = useState(false)
  const view = useGLView(stage, elRef, (s, el) => createFamilyView(s, el, FAMILY_INITIAL))

  useEffect(() => {
    view?.apply(state).then((resolved) => {
      if (resolved) setInfo(resolved)
    })
  }, [state, view])

  const patch = (partial: Partial<FamilyState>) => setState((previous) => ({ ...previous, ...partial }))

  return (
    <Row
      id="family"
      className="pt-20"
      asideClassName="lg:pt-20"
      aside={
        <SnippetPanel
          open={open}
          title="family.ts"
          code={familySnippet(state)}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
          Families &amp; italics
        </h2>
        <Caption>[family]</Caption>
      </div>
      <Prose className="mt-5">
        Three weights and two italics are baked here. Ask for any weight or style and the readout below says which atlas
        answered: a weight in between serves the closest bake, and an italic request with no italic bake gets a sheared
        one. The small line underneath puts regular, bold and italic in a single layout.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <ControlBar>
            <ControlCell label="style">
              <Segment active={state.style === 'normal'} onClick={() => patch({ style: 'normal' })}>
                roman
              </Segment>
              <Segment active={state.style === 'italic'} onClick={() => patch({ style: 'italic' })}>
                italic
              </Segment>
            </ControlCell>
            <ControlCell label="weight" grow>
              <Slider
                value={[state.weight]}
                min={100}
                max={900}
                step={10}
                className="min-w-16 flex-1"
                onValueChange={([value]) => {
                  // magnetize to the baked stops so exact hits are reachable
                  const weight = BAKED_STOPS.find((stop) => Math.abs(value - stop) <= 25) ?? value
                  patch({ weight })
                }}
              />
              <ControlValue>{state.weight}</ControlValue>
            </ControlCell>
          </ControlBar>
          <div ref={elRef} className="aspect-[16/9] w-full" />
          {/* fixed-width cells so the readout never reflows while dragging */}
          <div className="flex items-center gap-3 bg-paper px-3 py-2.5 font-mono text-[11px] tracking-[0.02em]">
            <span
              className={`inline-block w-[96px] px-1.5 py-0.5 text-center ${
                info?.mode === 'exact' ? 'bg-ink/10 text-ink' : 'bg-[#b4542a]/15 text-[#b4542a]'
              }`}
            >
              {info?.mode ?? '…'}
            </span>
            <span className="inline-block min-w-[110px] text-ink">{info?.served}</span>
            <span className="text-ink-faint">{info?.details}</span>
          </div>
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 02 · weights and italics from one family · defineFamily + createRichText</FigCaption>
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
        <SnippetPanel
          open={open}
          title="wipe.ts"
          code={wipeSnippet}
          html={html}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Erosion wipes</h2>
        <Caption>[effect]</Caption>
      </div>
      <Prose className="mt-5">
        The wipe never masks; it erodes. A front sweeps the ink and raises the distance threshold as it passes. Thin
        edges give way first, stroke skeletons hold out last, every glyph dissolving through its own field.
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
          <FigCaption>fig. 03 · threshold erosion · plays as it enters</FigCaption>
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
          code={scrambleSnippet}
          html={html}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Glyph scramble</h2>
        <Caption>[effect]</Caption>
      </div>
      <Prose className="mt-5">
        While driven, a glyph renders a random same-font glyph instead, re-rolled a few times a second: the decoder
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
          <FigCaption>fig. 04 · atlas scramble · decodes as it enters</FigCaption>
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
        <SnippetPanel
          open={open}
          title="liquid.ts"
          code={liquidSnippet}
          html={html}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <div className="flex items-start gap-1">
        <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Water writes</h2>
        <Caption>[composition]</Caption>
      </div>
      <Prose className="mt-5">
        The scramble&apos;s drive is just a scalar field, so anything can hold the pen. Here it&apos;s a small GPU fluid
        sim: ink splatted along the cursor stroke, advected by its own velocity, swirling while you move and soaking
        away when you stop. Glyphs on its rim re-roll through the atlas, the wet interior darkens the ink. None of it is
        library code; an audio level or a wipe front plugs into the same seam.
      </Prose>
      <figure className="mt-8">
        <div className="bg-[#dcdcda] p-[2px]">
          <div ref={elRef} className="aspect-[16/8] w-full touch-none" />
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 05 · fluid-sim ink driving the scramble</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}
