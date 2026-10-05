import type { Metadata } from 'next'
import { WeightExperiment } from '@/components/weight-experiment'

export const metadata: Metadata = {
  title: 'Weight interpolation experiment',
  robots: { index: false },
}

export default function Page() {
  return (
    <main className="mx-auto max-w-[1000px] px-6 py-16">
      <h1 className="font-serif text-[28px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
        Does one atlas beat five?
      </h1>
      <p className="mt-5 max-w-[640px] font-serif text-[16px] leading-[1.3] tracking-[0.01em] text-ink">
        Every row is the same weight rendered twice: once from its own baked atlas, once from a single delta atlas asked
        for that weight. If the encoding holds up, the red should disappear under the black. Where it does not, that is
        the error you would ship.
      </p>
      <p className="mt-3 max-w-[640px] font-serif text-[14px] leading-[1.3] tracking-[0.01em] text-[#6b6b6b]">
        Both sets are baked from Inter at size 64, distance range 12, same charset. The delta atlas stores the 300 field
        in RGB and the per-texel step toward 800 in alpha, so 300 and 800 are exact by construction and the middle is
        where it earns or loses.
      </p>
      <div className="mt-10">
        <WeightExperiment />
      </div>
    </main>
  )
}
