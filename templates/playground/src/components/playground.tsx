'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Metri } from '@joycostudio/metri'
import { MetriProvider } from '@joycostudio/metri/react'
import {
  Caption,
  CodePanel,
  CommandLine,
  CopyAction,
  DemoTitle,
  MonoButton,
  Prose,
  Row,
  SectionBreak,
  SectionTitle,
  SnippetPanel,
} from '@/components/layout'
import { Toc } from '@/components/toc'
import { JoycoLogo } from '@/components/joyco-logo'
import type { TocGroup } from '@/components/toc'
import {
  FamilyExample,
  LiquidExample,
  RichTextExample,
  ScrambleExample,
  SpecimenExample,
  WipeExample,
} from '@/components/examples'
import { AGENT_PROMPT } from '@/content/agent-prompt'
import { bakeRecipe } from '@/lib/snippets'
import type { HighlightedSnippets } from '@/lib/snippets'
import { createStage } from '../gl/stage'
import type { Stage } from '../gl/stage'

const GROUPS: TocGroup[] = [
  {
    label: 'Contents',
    sections: [
      { id: 'specimen', index: '01', label: 'Specimen' },
      { id: 'family', index: '02', label: 'Families' },
      { id: 'rich-text', index: '03', label: 'Rich text' },
      { id: 'pipeline', index: '04', label: 'Pipeline' },
    ],
  },
  {
    label: 'Effects',
    id: 'effects',
    sections: [
      { id: 'wipe', index: '05', label: 'Wipe' },
      { id: 'scramble', index: '06', label: 'Scramble' },
    ],
  },
  {
    label: 'Composition',
    id: 'composition',
    sections: [{ id: 'liquid', index: '07', label: 'Water writes' }],
  },
  {
    label: 'Appendix',
    sections: [
      { id: 'ecosystem', index: '08', label: 'Ecosystem' },
      { id: 'colophon', index: '09', label: 'Colophon' },
    ],
  },
]

const INSTALL_COMMAND = 'pnpm add lettra three'

function GettingStarted() {
  return (
    <div className="mt-10">
      <DemoTitle>Getting started</DemoTitle>
      <div className="mt-4">
        <CommandLine command={INSTALL_COMMAND} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 font-serif text-[16px] text-ink">
        <span>or</span>
        <CopyAction text={AGENT_PROMPT} label="copy agent prompt" tone="outline" />
        <span>paste it into your agent, it does the rest.</span>
      </div>
    </div>
  )
}

function MetaTable() {
  const rows: [string, string][] = [
    ['package', 'lettra · npm'],
    ['renderer', 'webgpu · webgl fallback'],
    ['engine', 'three/webgpu + tsl'],
    ['tracking', '@joycostudio/metri'],
    ['license', 'mit'],
  ]
  return (
    <table className="w-full border-collapse font-mono text-[12px] font-semibold tracking-[0.04em]">
      <tbody className="divide-y divide-ink-faint/30">
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td className="w-[140px] py-[7px] font-serif text-[13px] font-medium tracking-normal text-ink-faint">
              {key}
            </td>
            <td className="py-[7px] text-ink">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Complementary libraries, not dependencies: Lettra ships none of this. */
function RecommendedTable() {
  const rows: [string, string, string][] = [
    [
      '@joycostudio/metri',
      'https://hub.joyco.studio/toolbox/metri',
      'DOM rects in document space, one shared observer',
    ],
    ['@joycostudio/susano', 'https://www.npmjs.com/package/@joycostudio/susano', 'asset loading and preload dedupe'],
    ['@joycostudio/xyz', 'https://www.npmjs.com/package/@joycostudio/xyz', 'scene-wide warmup, text meshes included'],
    ['webgl scroll sync', 'https://hub.joyco.studio/logs/08-webgl-scroll-sync', 'pinning one canvas to the document'],
  ]
  return (
    <table className="mt-6 w-full border-collapse text-left">
      <tbody className="divide-y divide-ink-faint/30">
        {rows.map(([name, href, note]) => (
          <tr key={name}>
            <td className="w-[180px] py-[9px] pr-4 align-top font-mono text-[11.5px] font-semibold tracking-[0.02em]">
              <a href={href} className="text-ink underline decoration-1 underline-offset-2 hover:text-ink-faint">
                {name}
              </a>
            </td>
            <td className="py-[9px] align-top font-serif text-[14px] leading-[1.35] text-[#6b6b6b]">{note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Effects and composition are separate ideas, so each gets its own lead-in
 * before the figures that demonstrate it. */
function EffectsIntro() {
  return (
    <Row id="effects" className="pt-20">
      <SectionTitle caption="effects">Opt-in effects</SectionTitle>
      <Prose className="mt-5">
        The base material is plain MSDF fill and opacity. An effect is a uniform bag plus a set of per-wire transforms:
        pass one as <span className="font-mono text-[13px]">material.effect</span> and its uniforms merge into{' '}
        <span className="font-mono text-[13px]">text.uniforms</span>, fully typed. Each ships from its own module, so an
        effect you never import never reaches your bundle. The two below are what the library ships with.
      </Prose>
    </Row>
  )
}

function CompositionIntro() {
  return (
    <Row id="composition" className="pt-20">
      <SectionTitle caption="composition">Stacking and driving</SectionTitle>
      <Prose className="mt-5">
        Two effects on one text is <span className="font-mono text-[13px]">composeEffects(a, b)</span>: uniforms merge,
        uv remaps chain, erosions add, and the typing carries through. The deeper seam is{' '}
        <span className="font-mono text-[13px]">drive</span>, which takes any TSL node at all. That is where the library
        stops and your scene starts, so an audio level, a cursor distance or a whole fluid sim all plug in the same way.
      </Prose>
    </Row>
  )
}

export default function Playground({
  version,
  stageSource,
  specimenSource,
  highlighted,
}: {
  /** `VERSION` from the package itself, read on the server so the string is
   * all that reaches the client. */
  version: string
  stageSource: string
  specimenSource: string
  highlighted: HighlightedSnippets
}) {
  const metri = useMemo(() => new Metri(), [])
  useLayoutEffect(() => {
    metri.initialize()
    return () => metri.disposeAll()
  }, [metri])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stage, setStage] = useState<Stage | null>(null)
  const [bakeOpen, setBakeOpen] = useState(false)

  useEffect(() => {
    let disposed = false
    let created: Stage | null = null
    createStage(canvasRef.current!, metri)
      .then((result) => {
        if (disposed) {
          result.dispose()
          return
        }
        created = result
        setStage(result)
      })
      // no WebGPU and no WebGL fallback blanks every figure on the page: say so
      .catch((error) => {
        if (!disposed) console.error('[playground] stage failed to start', error)
      })
    return () => {
      disposed = true
      created?.dispose()
      setStage(null)
    }
  }, [metri])

  return (
    <MetriProvider metri={metri}>
      <div className="relative min-h-screen overflow-clip">
        {/* the shared stage — one page-space canvas, every figure is a
            Metri-tracked view scissored onto it */}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-30 will-change-transform"
        />

        <div className="relative mx-auto flex max-w-[1440px] justify-center gap-14 px-6">
          {/* left rail — hub-style contents */}
          <div className="sticky top-0 hidden h-screen w-[280px] shrink-0 self-start pt-14 pb-10 xl:block">
            {/* block hugs the body column; content inside stays left-aligned */}
            <div className="ml-auto flex h-full w-full max-w-[280px] flex-col">
              <div className="flex flex-col items-start gap-2 pb-10">
                <img src="/brand/wordmark.svg" alt="Lettra®" className="h-[26px] w-auto [filter:brightness(0.32)]" />
                <span className="font-mono text-[10px] tracking-[0.02em] text-ink-faint">v{version}</span>
              </div>
              <Toc groups={GROUPS} />
              <a
                href="https://joyco.studio"
                aria-label="JOYCO"
                className="mt-auto block w-fit text-ink-faint transition-colors hover:text-ink"
              >
                <JoycoLogo className="h-[15px] w-auto" />
              </a>
            </div>
          </div>

          {/* prose column + right rail */}
          <div className="grid min-w-0 grid-cols-1 gap-x-14 pb-28 lg:grid-cols-[minmax(0,580px)_minmax(0,460px)]">
            {/* masthead */}
            <Row>
              <div className="flex items-start gap-1 pt-14">
                <h1 className="font-serif text-[32px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">
                  Sharp text, baked flat
                </h1>
                <Caption>[webgpu]</Caption>
              </div>

              <Prose className="mt-7 text-[18px] leading-[1.35]">
                Lettra renders live, kerned typography on the GPU from a font baked once into a multi-channel signed
                distance field. No runtime shaper, no wasm: a few kilobytes of layout and a composable Three.js node
                material, sharp at any scale and any angle.
              </Prose>
              <Prose className="mt-4 text-[14px] text-[#6b6b6b]">
                Every figure below is ink on one shared canvas, scroll-synced to the page. Hit the{' '}
                <span className="font-mono text-[12px]">{'</>'}</span> square on any figure to read its snippet.
              </Prose>

              <GettingStarted />
            </Row>

            {/* fig. 01 — specimen */}
            <SpecimenExample stage={stage} />

            <SectionBreak />
            {/* fig. 02 — families & variable weight */}
            <FamilyExample stage={stage} />

            <SectionBreak />
            {/* fig. 03 — rich text, on the same stage-owned family */}
            <RichTextExample stage={stage} />

            <SectionBreak />
            {/* 04 — pipeline */}
            <Row
              id="pipeline"
              className="pt-20"
              asideClassName="lg:pt-20"
              aside={
                <SnippetPanel
                  open={bakeOpen}
                  title="bake.sh"
                  code={bakeRecipe}
                  html={highlighted.bake}
                  lang="bash"
                  onToggle={() => setBakeOpen((value) => !value)}
                />
              }
            >
              <SectionTitle caption="pipeline">How it works</SectionTitle>

              <div className="mt-6 flex flex-col gap-5">
                <Prose>
                  <span className="font-bold">Bake once.</span> A font becomes a small PNG atlas and a metrics JSON:
                  each glyph a multi-channel distance field, each kerning pair carried over. It happens at build time,
                  by hand or script. The library starts where the bake ends.{' '}
                  <MonoButton active={bakeOpen} onClick={() => setBakeOpen((value) => !value)}>
                    {bakeOpen ? 'hide recipe' : 'view recipe'}
                  </MonoButton>
                </Prose>
                <Prose>
                  <span className="font-bold">Lay out on the CPU.</span> A typed port of the classic BMFont pen walk:
                  pairwise kerning, greedy word wrap, alignment, letter-spacing. Bounds come from the ink itself rather
                  than font metrics, so display faces center the way they look, not the way their line boxes claim.
                </Prose>
                <Prose>
                  <span className="font-bold">Reconstruct on the GPU.</span> The material takes the median of three
                  channels, sharpens it over half a derivative&apos;s width, and exposes erosion wipes that dissolve
                  glyphs through the distance field, edges first and stroke skeletons last. Every node is exported,
                  typed, and replaceable.
                </Prose>
              </div>
            </Row>

            {/* 05 — effects: one lead-in, then fig. 04 wipe and fig. 05 scramble */}
            <SectionBreak />
            <EffectsIntro />
            <WipeExample stage={stage} html={highlighted.wipe} className="pt-12" />
            <ScrambleExample stage={stage} html={highlighted.scramble} className="pt-16" />

            {/* 06 — composition: the drive seam, demonstrated by fig. 06 */}
            <SectionBreak />
            <CompositionIntro />
            <LiquidExample stage={stage} html={highlighted.liquid} className="pt-12" />

            <SectionBreak />
            {/* 06 — ecosystem: what Lettra deliberately leaves to other libraries */}
            <Row id="ecosystem" className="pt-20">
              <SectionTitle caption="ecosystem">What pairs with it</SectionTitle>
              <Prose className="mt-5">
                Lettra draws text. It does not own your canvas, your scroll, or your render loop, and it never will.
                Those are someone else&apos;s job, so here is what we reach for and how this very page is built.
              </Prose>
              <RecommendedTable />
              <Prose className="mt-8">
                The page keeps a single WebGPU canvas in page space and slides it back over the viewport each frame, the
                &ldquo;absolute&rdquo; approach from the JOYCO{' '}
                <a
                  href="https://hub.joyco.studio/logs/08-webgl-scroll-sync"
                  className="underline decoration-1 underline-offset-2 hover:text-ink"
                >
                  WebGL Scroll Sync
                </a>{' '}
                log. Content never drifts from the DOM during scroll; 25% padding top and bottom absorbs the
                one-frame-stale transform. Each figure is a placeholder div measured by{' '}
                <a
                  href="https://hub.joyco.studio/toolbox/metri"
                  className="underline decoration-1 underline-offset-2 hover:text-ink"
                >
                  Metri
                </a>{' '}
                (cached document-space bounds, one shared ResizeObserver) and rendered into its rect with a scissored
                viewport. Frames are demand-driven: no scroll, no tween, no render.
              </Prose>

              <details className="group mt-8">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center bg-ink/8 font-mono text-[14px] text-ink-faint transition-colors group-hover:bg-ink/15 group-hover:text-ink">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-serif text-[16px] tracking-[0.01em] text-ink-faint transition-colors group-hover:text-ink">
                    fig. 07 · the stage <span className="pl-1 font-mono text-[11px] text-ink-faint">gl/stage.ts</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <CodePanel
                    title="gl/stage.ts"
                    code={stageSource}
                    html={highlighted.stage}
                    maxHeight="max-h-[480px]"
                  />
                </div>
              </details>

              <details className="group mt-6">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center bg-ink/8 font-mono text-[14px] text-ink-faint transition-colors group-hover:bg-ink/15 group-hover:text-ink">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-serif text-[16px] tracking-[0.01em] text-ink-faint transition-colors group-hover:text-ink">
                    fig. 08 · a view{' '}
                    <span className="pl-1 font-mono text-[11px] text-ink-faint">gl/views/specimen.ts</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <CodePanel
                    title="gl/views/specimen.ts"
                    code={specimenSource}
                    html={highlighted.specimen}
                    maxHeight="max-h-[480px]"
                  />
                </div>
              </details>
            </Row>

            <SectionBreak />
            {/* 08 — colophon */}
            <Row id="colophon" className="pt-20">
              <div className="pb-10">
                <MetaTable />
              </div>
              <div className="flex flex-col gap-3">
                <SectionTitle caption="colophon">From readme.md</SectionTitle>
                <Prose className="text-[14px] text-[#6b6b6b]">
                  Latin scripts, single and multiline, live string swap. No complex shaping, no color emoji, no bidi;
                  that work belongs to a real shaper. Layout ported from Jam3&apos;s layout-bmfont-text (MIT). Specimen
                  faces: Bebas Neue &amp; Lora, OFL. Append <span className="font-mono text-[12.5px]">?forceWebGL</span>{' '}
                  to exercise the fallback. MIT ©{' '}
                  <a href="https://joyco.studio" className="underline decoration-1 underline-offset-2 hover:text-ink">
                    joyco.studio
                  </a>
                </Prose>
              </div>
            </Row>
          </div>
        </div>
      </div>
    </MetriProvider>
  )
}
