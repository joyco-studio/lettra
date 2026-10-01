import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Metri } from '@joycostudio/metri'
import { MetriProvider } from '@joycostudio/metri/react'
import { Caption, CodePanel, CommandLine, CopyAction, MonoButton, Prose, Row, SnippetPanel } from '@/components/layout'
import { Toc } from '@/components/toc'
import { JoycoLogo } from '@/components/joyco-logo'
import type { TocSection } from '@/components/toc'
import { LiquidExample, ScrambleExample, SpecimenExample, WipeExample } from '@/components/examples'
import { createStage } from './gl/stage'
import type { Stage } from './gl/stage'
import stageSource from './gl/stage.ts?raw'
import specimenSource from './gl/views/specimen.ts?raw'

const SECTIONS: TocSection[] = [
  { id: 'specimen', index: '01', label: 'Specimen' },
  { id: 'pipeline', index: '02', label: 'Pipeline' },
  { id: 'wipe', index: '03', label: 'Wipe' },
  { id: 'scramble', index: '04', label: 'Scramble' },
  { id: 'liquid', index: '05', label: 'Water trail' },
  { id: 'implementation', index: '06', label: 'Implementation' },
  { id: 'colophon', index: '07', label: 'Colophon' },
]

const BAKE_RECIPE = `# instance variable fonts first — variable GPOS kerning
# bakes to 0 pairs otherwise (static GPOS reads fine)
python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf

# bake: MSDF atlas PNG + BMFont JSON metrics
# -r 8 — distance range 8, required for smooth erosion wipes
npx -y -p msdf-bmfont-xml msdf-bmfont \\
  -f json -i charset.txt -s 64 -r 8 -p 2 \\
  -t msdf --smart-size static.ttf`

const INSTALL_COMMAND = 'pnpm add letterpress three'

const AGENT_PROMPT = `Add letterpress (runtime MSDF text for Three.js WebGPURenderer + TSL) to this project.

Install: pnpm add letterpress three   (three >= 0.185)

Quickstart:
import { createText, loadFont, loadFontTexture, wipe } from 'letterpress/three'
const [font, map] = await Promise.all([loadFont('/fonts/display.json'), loadFontTexture('/fonts/display.png')])
const text = createText({ font, map, text: 'Hello', layout: { align: 'center' }, material: { fill: '#414141', effect: wipe() } })
scene.add(text.mesh)
await text.warmup(renderer, camera, scene) // pipeline compile + atlas upload off the hot path
text.uniforms.wipeIn.value = 1 // tween 0 -> 1 to reveal; wipeOut consumes

Fonts are baked once at build time (manual):
npx -y -p msdf-bmfont-xml msdf-bmfont -f json -i charset.txt -s 64 -r 8 -p 2 -t msdf --smart-size font.ttf
- instance variable fonts to a static weight first (python3 -m fontTools.varLib.instancer font.ttf wght=400 -o static.ttf) or GPOS kerning bakes to 0 pairs
- keep distance range 8 (erosion wipes need the SDF headroom), single atlas page, no rotated packing

Full API (layout engine, effects, composing TSL nodes, lifecycle contract): https://github.com/joyco-studio/letterpress#readme`

function GettingStarted() {
  return (
    <div className="mt-10">
      <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">Getting started</h2>
      <div className="mt-4">
        <CommandLine command={INSTALL_COMMAND} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 font-serif text-[16px] text-ink">
        <span>or</span>
        <CopyAction text={AGENT_PROMPT} label="copy agent prompt" tone="light" />
        <span>paste it into your agent, it does the rest.</span>
      </div>
    </div>
  )
}

function MetaTable() {
  const rows: [string, string][] = [
    ['package', 'letterpress · npm'],
    ['renderer', 'webgpu · webgl fallback'],
    ['engine', 'three/webgpu + tsl'],
    ['tracking', '@joycostudio/metri'],
    ['license', 'isc'],
  ]
  return (
    <table className="w-full border-collapse font-mono text-[12px] font-semibold tracking-[0.04em]">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td className="w-[140px] py-[7px] text-ink-faint">{key}</td>
            <td className="py-[7px] text-ink">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function App() {
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
    createStage(canvasRef.current!, metri).then((result) => {
      if (disposed) {
        result.dispose()
        return
      }
      created = result
      setStage(result)
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
              <div className="flex items-center gap-2 pb-10">
                <img src="/brand/logo-framed.svg" alt="Letterpress logo" className="h-10 w-10" />
                <img
                  src="/brand/wordmark.svg"
                  alt="Letterpress®"
                  className="h-[27px] w-auto [filter:brightness(0.32)]"
                />
              </div>
              <Toc sections={SECTIONS} />
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
                Letterpress renders live, kerned typography on the GPU from a font baked once into a multi-channel
                signed distance field. No runtime shaper, no wasm — a few kilobytes of layout and a composable Three.js
                node material, sharp at any scale and any angle.
              </Prose>
              <Prose className="mt-4 text-[14px] text-[#6b6b6b]">
                Every figure below is ink on a single shared canvas, scroll-synced to the page — hit the{' '}
                <span className="font-mono text-[12px]">{'</>'}</span> square on any of them to read the snippet
                alongside.
              </Prose>

              <GettingStarted />
            </Row>

            {/* fig. 01 — specimen */}
            <SpecimenExample stage={stage} />

            {/* 02 — pipeline */}
            <Row
              id="pipeline"
              className="pt-20"
              asideClassName="lg:pt-20"
              aside={
                <SnippetPanel
                  open={bakeOpen}
                  title="bake.sh"
                  code={BAKE_RECIPE}
                  lang="bash"
                  onToggle={() => setBakeOpen((value) => !value)}
                />
              }
            >
              <div className="flex items-start gap-1">
                <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
                  How it works
                </h2>
                <Caption>[pipeline]</Caption>
              </div>

              <div className="mt-6 flex flex-col gap-5">
                <Prose>
                  <span className="font-bold">Bake once.</span> A font becomes a small PNG atlas and a metrics JSON —
                  each glyph stored as a multi-channel distance field, each kerning pair carried over from the source.
                  It happens at build time, by hand or script; the library starts where the bake ends.{' '}
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
                  glyphs through the distance field — edges first, stroke skeletons last. Every node is exported, typed,
                  and replaceable.
                </Prose>
              </div>
            </Row>

            {/* fig. 02 — wipe, fig. 03 — scramble, fig. 04 — water trail */}
            <WipeExample stage={stage} />
            <ScrambleExample stage={stage} />
            <LiquidExample stage={stage} />

            {/* 06 — implementation */}
            <Row id="implementation" className="pt-20">
              <div className="flex items-start gap-1">
                <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">
                  One canvas, tracked
                </h2>
                <Caption>[stage]</Caption>
              </div>
              <Prose className="mt-5">
                The page keeps a single WebGPU canvas in page space and slides it back over the viewport each frame —
                the &ldquo;absolute&rdquo; approach from the JOYCO{' '}
                <a
                  href="https://hub.joyco.studio/logs/08-webgl-scroll-sync"
                  className="underline decoration-1 underline-offset-2 hover:text-ink"
                >
                  WebGL Scroll Sync
                </a>{' '}
                log: content never drifts from the DOM during scroll, and 25% of padding top and bottom absorbs the
                one-frame-stale transform. Each figure is a placeholder div measured by{' '}
                <a
                  href="https://hub.joyco.studio/toolbox/metri"
                  className="underline decoration-1 underline-offset-2 hover:text-ink"
                >
                  Metri
                </a>{' '}
                — cached document-space bounds, one shared ResizeObserver — and rendered into its rect with a scissored
                viewport. Frames are demand-driven: no scroll, no tween, no render.
              </Prose>

              <details className="group mt-8">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center bg-ink/8 font-mono text-[14px] text-ink-faint transition-colors group-hover:bg-ink/15 group-hover:text-ink">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-serif text-[16px] tracking-[0.01em] text-ink-faint transition-colors group-hover:text-ink">
                    fig. 05 — the stage <span className="pl-1 font-mono text-[11px] text-ink-faint">gl/stage.ts</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <CodePanel title="gl/stage.ts" code={stageSource} maxHeight="max-h-[480px]" />
                </div>
              </details>

              <details className="group mt-6">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center bg-ink/8 font-mono text-[14px] text-ink-faint transition-colors group-hover:bg-ink/15 group-hover:text-ink">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-serif text-[16px] tracking-[0.01em] text-ink-faint transition-colors group-hover:text-ink">
                    fig. 06 — a view <span className="pl-1 font-mono text-[11px] text-ink-faint">gl/views/specimen.ts</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <CodePanel title="gl/views/specimen.ts" code={specimenSource} maxHeight="max-h-[480px]" />
                </div>
              </details>
            </Row>

            {/* 07 — colophon */}
            <Row id="colophon" className="pt-24">
              <div className="pb-10">
                <MetaTable />
              </div>
              <div className="flex flex-col gap-3">
                <h2 className="font-serif text-[21px] leading-[1.15] font-bold tracking-[-0.02em] text-ink">From readme.md</h2>
                <Prose className="text-[14px] text-[#6b6b6b]">
                  Latin scripts, single and multiline, live string swap. No complex shaping, no color emoji, no bidi —
                  that work belongs to a real shaper. Layout ported from Jam3&apos;s layout-bmfont-text (MIT). Specimen
                  faces: Bebas Neue &amp; Lora, OFL. Append <span className="font-mono text-[12.5px]">?forceWebGL</span>{' '}
                  to exercise the fallback. ISC ©{' '}
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
