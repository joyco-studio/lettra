'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { ControlBar, ControlCell, ControlValue, Segment } from '@/components/layout'
import { createMorphLab, METHODS, VIEWS } from '@/gl/experiments/morph-lab'
import type { LabState, Method, MorphLab, View } from '@/gl/experiments/morph-lab'

const METHOD_LABEL: Record<Method, string> = {
  truth: 'truth',
  mix2: 'two bakes',
  morph2: 'two + warp',
  warpNearest: 'one + warp',
  warpSmooth: 'one + smooth',
}
const VIEW_LABEL: Record<View, string> = {
  single: 'render',
  sideBySide: 'over truth',
  difference: 'difference',
  inkXor: 'ink error',
}

export function MorphExperiment() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labRef = useRef<MorphLab | null>(null)
  const [ready, setReady] = useState(false)
  const [glyphs, setGlyphs] = useState<string[]>([])
  const [scores, setScores] = useState<
    Record<string, Record<string, Record<string, { worstEdgePx: number; iou: number; defects: number }>>>
  >({})
  const [free, setFree] = useState(false)
  const [s, setS] = useState<LabState>({
    glyph: 'n',
    weight: 550,
    method: 'morph2',
    view: 'sideBySide',
    zoom: 1,
    panX: 0,
    panY: 0,
    showVectors: false,
    showGrid: false,
  })

  useEffect(() => {
    let lab: MorphLab | null = null
    let dead = false
    createMorphLab(canvasRef.current!, '/experiments/weight').then((l) => {
      if (dead) return l.dispose()
      lab = l
      labRef.current = l
      setGlyphs(Object.keys(l.manifest.glyphs))
      setReady(true)
    })
    fetch('/experiments/weight/scores.json')
      .then((r) => r.json())
      .then(setScores)
      .catch(() => {})
    return () => {
      dead = true
      lab?.dispose()
      labRef.current = null
    }
  }, [])

  useEffect(() => {
    if (ready) labRef.current?.render(s)
  }, [s, ready])

  const stateRef = useRef(s)
  stateRef.current = s

  const patch = useCallback((p: Partial<LabState>) => setS((prev) => ({ ...prev, ...p })), [])

  // the canvas is flex-sized, so it has no usable height until layout settles;
  // without this it stays 0px and swallows pointer events
  useEffect(() => {
    const el = canvasRef.current
    if (!el || !ready) return
    const ro = new ResizeObserver(() => labRef.current?.render(stateRef.current))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ready])

  // click to centre the zoom; dragging a GL canvas was unreliable and is gone
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const click = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const side = Math.min(r.width, r.height)
      const cx = (e.clientX - r.left - (r.width - side) / 2) / side
      const cy = (e.clientY - r.top - (r.height - side) / 2) / side
      setS((p) => ({ ...p, panX: p.panX + (cx - 0.5) / p.zoom, panY: p.panY + (cy - 0.5) / p.zoom }))
    }
    el.addEventListener('click', click)
    return () => el.removeEventListener('click', click)
  }, [])

  const nearest = [400, 450, 500, 550, 600, 650, 700].reduce((a, b) =>
    Math.abs(b - s.weight) < Math.abs(a - s.weight) ? b : a
  )
  const onStop = s.weight % 50 === 0
  const sc = scores[s.glyph]?.[String(nearest)]?.[s.method === 'truth' ? 'mix2' : s.method]

  return (
    <div className="flex h-full min-h-0 flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
      <ControlBar>
        <ControlCell label="glyph">
          {glyphs.map((g) => (
            <Segment key={g} active={s.glyph === g} onClick={() => patch({ glyph: g })}>
              {g}
            </Segment>
          ))}
        </ControlCell>
      </ControlBar>
      <ControlBar>
        <ControlCell label="method">
          {METHODS.map((m) => (
            <Segment key={m} active={s.method === m} onClick={() => patch({ method: m })}>
              {METHOD_LABEL[m]}
            </Segment>
          ))}
        </ControlCell>
        <ControlCell label="view">
          {VIEWS.map((v) => (
            <Segment key={v} active={s.view === v} onClick={() => patch({ view: v })}>
              {VIEW_LABEL[v]}
            </Segment>
          ))}
        </ControlCell>
      </ControlBar>
      <ControlBar>
        <ControlCell label="weight" grow>
          <Slider
            value={[s.weight]}
            min={400}
            max={700}
            step={free ? 1 : 50}
            className="min-w-16 flex-1"
            onValueChange={([v]) => patch({ weight: v })}
          />
          <ControlValue>{s.weight}</ControlValue>
        </ControlCell>
        <ControlCell label="sweep">
          <Segment
            active={free}
            onClick={() => {
              const next = !free
              setFree(next)
              // snapping back must land on a real bake, or the truth layer lies
              if (!next) patch({ weight: Math.round(s.weight / 50) * 50 })
            }}
          >
            free
          </Segment>
        </ControlCell>
        <ControlCell label="zoom" grow>
          <Slider
            value={[s.zoom]}
            min={1}
            max={24}
            step={0.1}
            className="min-w-16 flex-1"
            onValueChange={([v]) => patch({ zoom: v })}
          />
          <ControlValue>{s.zoom.toFixed(1)}×</ControlValue>
        </ControlCell>
        <ControlCell label="grid">
          <Segment active={s.showGrid} onClick={() => patch({ showGrid: !s.showGrid })}>
            texels
          </Segment>
          <Segment onClick={() => patch({ zoom: 1, panX: 0, panY: 0 })}>reset</Segment>
        </ControlCell>
      </ControlBar>

      <div className="relative min-h-0 flex-1 bg-[#dedede]">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full cursor-crosshair touch-none" />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-paper px-3 py-2.5 font-mono text-[11px] text-ink-faint">
        <span className="text-ink">
          {s.method === 'truth' ? `real bake @ ${nearest}` : `${METHOD_LABEL[s.method]} @ ${s.weight}`}
        </span>
        {!onStop && <span className="text-[#b4542a]">off-stop: no ground truth here, truth layer shows {nearest}</span>}
        {sc && onStop && s.method !== 'truth' && (
          <>
            <span>
              worst edge <span className="text-ink">{sc.worstEdgePx.toFixed(2)}px</span>
            </span>
            <span>
              IoU <span className="text-ink">{sc.iou.toFixed(4)}</span>
            </span>
            <span className="text-ink-faint">(measured, not estimated)</span>
          </>
        )}
        <span className="ml-auto">click to centre · zoom with the slider</span>
      </div>
    </div>
  )
}
