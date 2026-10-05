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
    Record<string, Record<string, Record<string, { worstEdgePx: number; iou: number }>>>
  >({})
  const [free, setFree] = useState(false)
  const [s, setS] = useState<LabState>({
    glyph: 'n',
    weight: 550,
    method: 'mix2',
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

  const patch = useCallback((p: Partial<LabState>) => setS((prev) => ({ ...prev, ...p })), [])

  // drag to pan, wheel to zoom
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    let drag = false,
      lx = 0,
      ly = 0
    const down = (e: PointerEvent) => {
      drag = true
      lx = e.clientX
      ly = e.clientY
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const k = 1 / (el.clientWidth * 0.9)
      setS((p) => ({
        ...p,
        panX: p.panX - ((e.clientX - lx) * k) / p.zoom,
        panY: p.panY + ((e.clientY - ly) * k) / p.zoom,
      }))
      lx = e.clientX
      ly = e.clientY
    }
    const up = () => {
      drag = false
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      setS((p) => ({ ...p, zoom: Math.min(24, Math.max(1, p.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) }))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
    }
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

      <canvas
        ref={canvasRef}
        className="block aspect-square w-full cursor-grab touch-none bg-[#dedede] active:cursor-grabbing"
      />

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
        <span className="ml-auto">drag to pan · wheel to zoom</span>
      </div>
    </div>
  )
}
