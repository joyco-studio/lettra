import type { Metadata } from 'next'
import { MorphExperiment } from '@/components/morph-experiment'

export const metadata: Metadata = { title: 'Weight morphing experiments', robots: { index: false } }

export default function Page() {
  return (
    <main className="mx-auto max-w-[1100px] px-6 py-14">
      <h1 className="font-serif text-[28px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
        Weight morphing, measured
      </h1>
      <p className="mt-5 max-w-[660px] font-serif text-[16px] leading-[1.3] tracking-[0.01em] text-ink">
        Every weight here is rendered through one shared transform, so all seven cells sit on an identical texel
        lattice. That is what the previous attempt got wrong: each bake was framed from its own bounding box, so the
        instances were sub-pixel misaligned before any interpolation ran, and the error got blamed on the math.
      </p>
      <p className="mt-3 max-w-[660px] font-serif text-[14px] leading-[1.3] tracking-[0.01em] text-[#6b6b6b]">
        Ground truth is Inter instanced with fontTools at 400 through 700. Pick a method, sweep the weight, and zoom in
        on a join or a terminal. &ldquo;ink error&rdquo; paints only the texels that land on the wrong side of the edge,
        which is the honest view.
      </p>
      <div className="mt-9">
        <MorphExperiment />
      </div>
    </main>
  )
}
