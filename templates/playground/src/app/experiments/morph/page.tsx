import type { Metadata } from 'next'
import { MorphExperiment } from '@/components/morph-experiment'

export const metadata: Metadata = { title: 'Weight morphing experiments', robots: { index: false } }

const METHODS: [string, string][] = [
  ['truth', 'The real bake at this weight. Not a method — the thing the others are trying to match.'],
  ['two bakes', 'Ship 400 and 700, blend their distance fields. 0.67px worst edge, IoU 0.9916.'],
  ['two + warp', 'Blend, but push each bake along the outline movement first. Best overlap, 0.9959.'],
  ['one + warp', 'Ship only 400 plus a displacement map; each texel takes its nearest outline point. 2.05px.'],
  ['one + smooth', 'Same, but displacement is distance-weighted so stem interiors average both edges. 1.48px.'],
]

const VIEWS: [string, string][] = [
  ['render', 'The method alone, as it would ship.'],
  ['over truth', 'Method in red on the real bake in black. Red showing means a mismatch.'],
  ['difference', 'Signed: red where the method is too heavy, blue where too light.'],
  ['ink error', 'Only texels that land on the wrong side of the edge. The honest view.'],
]

export default function Page() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 overflow-y-auto border-ink-faint/20 px-6 py-7 lg:w-[330px] lg:border-r">
        <div>
          <h1 className="font-serif text-[21px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
            Weight morphing, measured
          </h1>
          <p className="mt-3 font-serif text-[14px] leading-[1.35] text-[#5a5a5a]">
            All seven weights are rendered through one shared transform, so every cell sits on an identical texel
            lattice. The previous attempt framed each bake from its own bounding box, so the instances were sub-pixel
            misaligned before any interpolation ran and the error got blamed on the math.
          </p>
        </div>

        <div>
          <h2 className="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">Methods</h2>
          <dl className="mt-2.5 flex flex-col gap-2">
            {METHODS.map(([name, text]) => (
              <div key={name}>
                <dt className="font-mono text-[11px] text-ink">{name}</dt>
                <dd className="font-serif text-[13px] leading-[1.3] text-[#6b6b6b]">{text}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">Views</h2>
          <dl className="mt-2.5 flex flex-col gap-2">
            {VIEWS.map(([name, text]) => (
              <div key={name}>
                <dt className="font-mono text-[11px] text-ink">{name}</dt>
                <dd className="font-serif text-[13px] leading-[1.3] text-[#6b6b6b]">{text}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-auto font-serif text-[13px] leading-[1.3] text-[#6b6b6b]">
          Ground truth is Inter instanced with fontTools at 400&ndash;700. Weight snaps to those stops; off them there
          is nothing to compare against. Try <span className="font-mono text-[12px] text-ink">M</span> and{' '}
          <span className="font-mono text-[12px] text-ink">W</span> — they fail worst.
        </p>
      </aside>

      <main className="min-h-0 flex-1 p-3">
        <MorphExperiment />
      </main>
    </div>
  )
}
