import type { Metadata } from 'next'
import { MorphExperiment } from '@/components/morph-experiment'

export const metadata: Metadata = { title: 'Weight morphing experiments', robots: { index: false } }

const METHODS: [string, string, string][] = [
  ['truth', '—', 'The real bake at this weight. Not a method: the thing the others try to match.'],
  ['two bakes', '0.67px · 0.9916', 'Ship 400 and 700, blend the two distance fields. No cleverness.'],
  ['two + warp', '0.81px · 0.9959', 'Blend, but push each bake along the outline movement first.'],
  [
    'one + warp',
    '1.35px · 0.9942',
    'Ship only 400 plus a displacement map; each texel takes its nearest outline point.',
  ],
  [
    'one + smooth',
    '1.40px · 0.9819',
    'Same, but the displacement is distance-weighted, so stem interiors average both edges.',
  ],
]

const VIEWS: [string, string][] = [
  ['render', 'The method alone, as it would ship.'],
  ['over truth', 'The method in ink over the real bake in pale grey. Grey spilling out means a mismatch.'],
  ['difference', 'Signed: red where the method is too heavy, blue where too light.'],
  ['ink error', 'Only texels that land on the wrong side of the edge. The honest view.'],
]

export default function Page() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 overflow-y-auto border-ink-faint/20 px-6 py-7 lg:w-[330px] lg:border-r">
        <div>
          <a
            href="/"
            className="mb-3 inline-block font-mono text-[11px] tracking-[0.02em] text-ink-faint transition-colors hover:text-ink"
          >
            &larr; lettra
          </a>
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
          <h2 className="font-mono text-[10px] tracking-[0.08em] text-ink-faint uppercase">
            Methods <span className="normal-case">(worst edge · visual defects)</span>
          </h2>
          <dl className="mt-2.5 flex flex-col gap-2">
            {METHODS.map(([name, score, text]) => (
              <div key={name}>
                <dt className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-ink">
                  <span>{name}</span>
                  <span className="text-[10px] text-ink-faint">{score}</span>
                </dt>
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
          Defects count holes punched in solid ink and specks left in the background. IoU averages those away, which is
          why it scored a torn stem at 0.994. Both single-bake warps tear; both two-bake methods are clean. Try{' '}
          <span className="font-mono text-[12px] text-ink">W</span> and{' '}
          <span className="font-mono text-[12px] text-ink">M</span> on <em>one + warp</em> to see it.
        </p>
      </aside>

      <main className="min-h-0 flex-1 p-3">
        <MorphExperiment />
      </main>
    </div>
  )
}
