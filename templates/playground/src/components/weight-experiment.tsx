'use client'

import { useEffect, useRef, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { ControlBar, ControlCell, ControlValue, Segment } from '@/components/layout'
import { createWeightLab, STOPS } from '@/gl/experiments/weight-lab'
import type { LabMode, WeightLab } from '@/gl/experiments/weight-lab'

const WORD = 'Hamburgefonstiv'

export function WeightExperiment() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [lab, setLab] = useState<WeightLab | null>(null)
  const [mode, setMode] = useState<LabMode>('overlay')
  const [weight, setWeight] = useState(550)
  const [word, setWord] = useState(WORD)

  useEffect(() => {
    let disposed = false
    let created: WeightLab | null = null
    createWeightLab(canvasRef.current!, WORD).then((result) => {
      if (disposed) return result.dispose()
      created = result
      setLab(result)
    })
    return () => {
      disposed = true
      created?.dispose()
      setLab(null)
    }
  }, [])

  useEffect(() => {
    lab?.setMode(mode)
  }, [lab, mode])

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-[2px] bg-[#dcdcda] p-[2px]">
      <ControlBar>
        <ControlCell label="rows">
          <Segment active={mode === 'overlay'} onClick={() => setMode('overlay')}>
            overlay
          </Segment>
          <Segment active={mode === 'split'} onClick={() => setMode('split')}>
            split
          </Segment>
        </ControlCell>
        <ControlCell label="free row" grow>
          <Slider
            value={[weight]}
            min={300}
            max={800}
            step={5}
            className="min-w-16 flex-1"
            onValueChange={([value]) => {
              setWeight(value)
              lab?.setT((value - 300) / 500)
            }}
          />
          <ControlValue>{weight}</ControlValue>
        </ControlCell>
        <ControlCell label="word" grow>
          <input
            value={word}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink outline-none"
            onChange={(event) => {
              setWord(event.target.value)
              lab?.setText(event.target.value)
            }}
          />
        </ControlCell>
      </ControlBar>
      <canvas ref={canvasRef} className="block aspect-[4/5] w-full" />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-paper px-3 py-2.5 font-mono text-[11px] text-ink-faint">
        <span>
          <span className="mr-1.5 inline-block size-2 translate-y-[1px] bg-[#1b1b1b]" />
          baked instance
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2 translate-y-[1px] bg-[#d4482a]" />
          one delta atlas at the same weight
        </span>
        <span>rows, top to bottom: {STOPS.join(' · ')}</span>
        <span>the detached bottom row is the slider only: delta atlas, no baked counterpart</span>
      </div>
    </div>
  )
}
