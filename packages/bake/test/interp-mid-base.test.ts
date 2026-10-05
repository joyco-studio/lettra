/* Approach B, the proposed encoding: RGB = mid-weight field, alpha =
 * symmetric half-span delta, reconstruct = mid + (t − 0.5) × 2 × Δ. Exact at
 * the middle where text actually sits, half the lever arm toward either
 * endpoint, and the MSDF-sharp base is the most-used weight. The tradeoff:
 * endpoints inherit the field's nonlinearity instead of being exact, so
 * families should still declare the true endpoint bakes when they matter. */

import { describe, expect, it } from 'vitest'
import { errorAgainstTruth, midBaseEncoding, minBaseEncoding, report } from './field-eval'

const mid = midBaseEncoding()
const min = minBaseEncoding()

describe('weight interpolation, mid-base symmetric delta (proposed)', () => {
  it('is exact at the middle of the range', () => {
    const { mean, max } = errorAgainstTruth(mid, 550)
    expect(mean).toBe(0)
    expect(max).toBe(0)
  })

  it('keeps endpoint error within the field nonlinearity plus quantization', () => {
    console.log(`\n${report(mid)}\n`)
    for (const weight of [300, 800] as const) {
      const { mean, flips } = errorAgainstTruth(mid, weight)
      expect(mean).toBeLessThan(0.05)
      expect(flips).toBeLessThan(0.05)
    }
  })

  it('beats the shipping encoding on worst-case error across the range', () => {
    const weights = [300, 425, 550, 675, 800] as const
    const worstMid = Math.max(...weights.map((weight) => errorAgainstTruth(mid, weight).mean))
    const worstMin = Math.max(...weights.map((weight) => errorAgainstTruth(min, weight).mean))
    // harmonic = no bad spot anywhere on the slider, not perfection at the ends
    expect(worstMid).toBeLessThan(worstMin)
  })

  it('beats the shipping encoding on real pixel flips at the quarter points', () => {
    for (const weight of [425, 675] as const) {
      expect(errorAgainstTruth(mid, weight).flips).toBeLessThanOrEqual(errorAgainstTruth(min, weight).flips)
    }
  })
})
