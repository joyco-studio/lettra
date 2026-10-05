/* Approach A, the shipping encoding: RGB = min-weight field, alpha = full-
 * span median delta, reconstruct = min + t × Δ. Endpoint-exact at both ends
 * (t=1 recovers the max median per texel, quantization aside); all the error
 * concentrates between the endpoints, and corner sharpness decays with t
 * since the MSDF base is the light end. */

import { describe, expect, it } from 'vitest'
import { WEIGHTS, errorAgainstTruth, minBaseEncoding, report, toT } from './field-eval'

const encoding = minBaseEncoding()
/** Half an 8-bit alpha step at the measured deltaScale, with regrid slack. */
const QUANT_BOUND = 0.012

describe('weight interpolation, min-base delta (shipping)', () => {
  it('is exact at the light endpoint', () => {
    const { mean, max } = errorAgainstTruth(encoding, 300)
    expect(mean).toBe(0)
    expect(max).toBe(0)
  })

  it('recovers the bold endpoint within alpha quantization', () => {
    const { mean, flips } = errorAgainstTruth(encoding, 800)
    expect(mean).toBeLessThan(QUANT_BOUND)
    expect(flips).toBeLessThan(0.01)
  })

  it('reports mid-range error against the true instances', () => {
    console.log(`\n${report(encoding)}\n`)
    for (const weight of [425, 550, 675] as const) {
      const { mean } = errorAgainstTruth(encoding, weight)
      expect(mean).toBeGreaterThan(0) // nonlinearity exists; the table above quantifies it
      expect(mean).toBeLessThan(0.08) // sanity: still a usable field, not garbage
    }
  })

  it('concentrates all its error between the endpoints', () => {
    // measured: Inter's stroke growth is most nonlinear near the light end,
    // so the worst spot is the quarter point, not the approach to bold
    const endpoints = [300, 800].map((weight) => errorAgainstTruth(encoding, weight as 300).mean)
    const mids = [425, 550, 675].map((weight) => errorAgainstTruth(encoding, weight as 425).mean)
    expect(Math.min(...mids)).toBeGreaterThan(Math.max(...endpoints))
    expect(toT(WEIGHTS[0])).toBe(0)
  })
})
