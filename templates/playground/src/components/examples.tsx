import { useEffect, useRef, useState } from 'react'
import { useObserve } from '@joycostudio/metri/react'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  ControlBar,
  ControlCell,
  ControlValue,
  DemoTitle,
  FieldLabel,
  FigCaption,
  Prose,
  Row,
  SectionTitle,
  Segment,
  SnippetPanel,
} from '@/components/layout'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import {
  familySnippet,
  richTextSnippet,
  specimenSnippet,
  wipeSnippet,
  scrambleSnippet,
  liquidSnippet,
} from '@/lib/snippets'
import { SpanEditor } from '@/components/span-editor'
import type { FontName, Stage } from '@/gl/stage'
import { createSpecimenView } from '@/gl/views/specimen'
import type { Align, SpecimenState } from '@/gl/views/specimen'
import { createFamilyView } from '@/gl/views/family'
import type { FamilyInfo, FamilyState } from '@/gl/views/family'
import { createRichTextView, RICH_SPANS, RICH_TEXT } from '@/gl/views/rich-text'
import type { RichTextInfo, RichTextState } from '@/gl/views/rich-text'
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
    createRef
      .current(stage, el)
      .then((created) => {
        if (disposed) {
          created.dispose()
          return
        }
        current = created
        setView(created)
      })
      // an atlas that 404s or a warmup that rejects leaves the plate blank;
      // without this it is also an unhandled rejection with no clue attached
      .catch((error) => {
        if (!disposed) console.error('[playground] figure failed to start', error)
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
            <ControlCell>
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
            <ControlCell>
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
          <label className="block bg-paper px-3 pt-2 pb-2.5">
            <FieldLabel>text</FieldLabel>
            <Textarea
              value={state.text}
              spellCheck={false}
              rows={2}
              className="mt-1.5 min-h-0 w-full resize-none border-0 bg-transparent p-0 font-mono text-[13px] leading-[1.6] tracking-[0.02em] text-ink shadow-none focus-visible:ring-0 dark:bg-transparent"
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
/** The CSS weight ladder. Weight is never interpolated, so the slider snaps
 * through the ladder instead of sweeping: every position is a request a real
 * page would make. */
const WEIGHT_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900]
/** The three actually baked, ticked darker so an exact hit is aimable. */
const BAKED_STOPS = [200, 400, 700]
/** Half the thumb, which is `w-1.5`: the track's usable span is inset by it,
 * so a tick at value v sits at v × (100% − thumb) + half. */
const THUMB_HALF = '3px'

export function FamilyExample({ stage }: { stage: Stage | null }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState(FAMILY_INITIAL)
  const [info, setInfo] = useState<FamilyInfo | null>(null)
  const [open, setOpen] = useState(false)
  const view = useGLView(stage, elRef, (s, el) => createFamilyView(s, el, FAMILY_INITIAL))

  useEffect(() => {
    if (!view) return
    let live = true
    view
      .apply(state)
      .then((resolved) => {
        if (live && resolved) setInfo(resolved)
      })
      .catch((error) => {
        // clear the readout: leaving the last result up would have the figure
        // claim an exact hit while the mesh still shows the previous variant
        console.error('[playground] family variant failed to load', error)
        if (live) setInfo(null)
      })
    return () => {
      live = false
    }
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
      <SectionTitle caption="family">Families &amp; italics</SectionTitle>
      <Prose className="mt-5">
        Three weights and two italics are baked here. The slider snaps through the CSS weight ladder, with the baked
        weights ticked darker, and the readout says which atlas answered: a weight in between serves the closest bake
        unmodified, since weight is never synthesized. Only the oblique is, and this family bakes both italics, so it
        never needs one.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <ControlBar>
            <ControlCell>
              <Segment active={state.style === 'normal'} onClick={() => patch({ style: 'normal' })}>
                roman
              </Segment>
              <Segment active={state.style === 'italic'} onClick={() => patch({ style: 'italic' })}>
                italic
              </Segment>
            </ControlCell>
            <ControlCell label="weight" grow>
              <div className="relative min-w-16 flex-1">
                <Slider
                  value={[state.weight]}
                  min={WEIGHT_STOPS[0]}
                  max={WEIGHT_STOPS[WEIGHT_STOPS.length - 1]}
                  step={100}
                  onValueChange={([weight]) => patch({ weight })}
                />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 mt-[7px]">
                  {WEIGHT_STOPS.map((stop) => (
                    <span
                      key={stop}
                      className={`absolute h-1 w-px -translate-x-1/2 ${
                        BAKED_STOPS.includes(stop) ? 'bg-ink' : 'bg-ink/25'
                      }`}
                      style={{
                        left: `calc(${(stop - WEIGHT_STOPS[0]) / (WEIGHT_STOPS[WEIGHT_STOPS.length - 1] - WEIGHT_STOPS[0])} * (100% - ${THUMB_HALF} * 2) + ${THUMB_HALF})`,
                      }}
                    />
                  ))}
                </div>
              </div>
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
          <FigCaption>fig. 02 · weights and italics from one family · defineFamily</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

const RICH_INITIAL: RichTextState = { text: RICH_TEXT, spans: RICH_SPANS, align: 'center' }

export function RichTextExample({ stage }: { stage: Stage | null }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState(RICH_INITIAL)
  const [info, setInfo] = useState<RichTextInfo | null>(null)
  const [open, setOpen] = useState(false)
  const view = useGLView(stage, elRef, (s, el) => createRichTextView(s, el, RICH_INITIAL))

  useEffect(() => {
    if (!view) return
    setInfo(view.apply(state))
  }, [state, view])

  const patch = (partial: Partial<RichTextState>) => setState((previous) => ({ ...previous, ...partial }))

  return (
    <Row
      id="rich-text"
      className="pt-20"
      asideClassName="lg:pt-20"
      aside={
        <SnippetPanel
          open={open}
          title="rich-text.ts"
          code={richTextSnippet(state)}
          onToggle={() => setOpen((value) => !value)}
        />
      }
    >
      <SectionTitle caption="rich text">Spans in one paragraph</SectionTitle>
      <Prose className="mt-5">
        A span is a <span className="font-mono text-[13px]">{'{ start, end, weight, style }'}</span> range over the same
        string, resolved through the same family. One layout measures the whole paragraph, so the wrap, the alignment
        and the baseline hold across every run, and the runs bucket by resolved variant: two italic spans cost one draw
        call, not two. Kerning is the one thing that stops at a boundary, since the pair tables are per font.
      </Prose>
      <Prose className="mt-4 text-[14px] text-[#6b6b6b]">
        Write in the field under the figure and select a few words to set a weight or an italic on them. The editor is
        the <span className="font-mono text-[12px]">{'{ text, spans }'}</span> pair, nothing more. 500 has no bake, so
        it serves 400 and folds back into its neighbours: the draw count does not move.
      </Prose>
      <figure className="mt-8">
        <div className="flex flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
          <ControlBar>
            <ControlCell>
              {ALIGNS.map((align) => {
                const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
                return (
                  <Segment key={align} title={align} active={state.align === align} onClick={() => patch({ align })}>
                    <Icon size={13} strokeWidth={2.25} />
                  </Segment>
                )
              })}
            </ControlCell>
          </ControlBar>
          <div ref={elRef} className="aspect-[16/9] w-full" />
          <SpanEditor
            defaultText={RICH_INITIAL.text}
            defaultSpans={RICH_INITIAL.spans}
            onChange={({ text, spans }) => patch({ text, spans })}
          />
          {/* runs vs draws is the whole point of bucketing: fixed-width cells
              so the readout never reflows while typing */}
          <div className="flex items-center gap-3 bg-paper px-3 py-2.5 font-mono text-[11px] tracking-[0.02em]">
            <span className="inline-block w-[96px] bg-ink/10 px-1.5 py-0.5 text-center text-ink">
              {info ? `${info.runs} runs` : '…'}
            </span>
            <span className="inline-block min-w-[110px] text-ink">{info ? `${info.draws} draw calls` : null}</span>
            <span className="text-ink-faint">
              {info ? `${state.spans.length} span${state.spans.length === 1 ? '' : 's'}, one layout` : null}
            </span>
          </div>
        </div>
        <figcaption className="mt-5">
          <FigCaption>fig. 03 · weight and italic spans in one layout · createRichText</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function WipeExample({
  stage,
  html,
  className = 'pt-20',
}: {
  stage: Stage | null
  html: string
  className?: string
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const view = useGLView(stage, elRef, createWipeView)
  const { visible } = useObserve(elRef, { threshold: 0.5 })
  usePlayOnEnter(visible, view !== null, () => view?.wipe('in'))

  return (
    <Row
      id="wipe"
      className={className}
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
      <DemoTitle>Erosion wipes</DemoTitle>
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
          <FigCaption>fig. 04 · threshold erosion · plays as it enters</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function ScrambleExample({
  stage,
  html,
  className = 'pt-20',
}: {
  stage: Stage | null
  html: string
  className?: string
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(0)
  const view = useGLView(stage, elRef, createScrambleView)
  const { visible } = useObserve(elRef, { threshold: 0.5 })
  usePlayOnEnter(visible, view !== null, () => view?.decode())

  return (
    <Row
      id="scramble"
      className={className}
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
      <DemoTitle>Glyph scramble</DemoTitle>
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
          <FigCaption>fig. 05 · atlas scramble · decodes as it enters</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}

export function LiquidExample({
  stage,
  html,
  className = 'pt-20',
}: {
  stage: Stage | null
  html: string
  className?: string
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useGLView(stage, elRef, createLiquidView)

  return (
    <Row
      id="liquid"
      className={className}
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
      <DemoTitle>Water writes</DemoTitle>
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
          <FigCaption>fig. 06 · fluid-sim ink driving the scramble</FigCaption>
        </figcaption>
      </figure>
    </Row>
  )
}
