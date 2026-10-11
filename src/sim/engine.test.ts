import { monteCarlo, quantile, summarize, compare, runOnce, type SimModel, type ScenarioSampler } from './engine'
import { mulberry32 } from './rng'

interface S { cash: number }
interface P { start: number }
interface L { spend: number }
interface X { income: number }

const toy: SimModel<S, P, L, X> = {
  init: p => ({ cash: p.start }),
  step: (s, _p, l, x) => ({ cash: s.cash + x.income - l.spend }),
  metrics: s => ({ cash: s.cash, broke: s.cash < 0 ? 1 : 0 }),
}
const sampler: ScenarioSampler<X> = {
  sample: (rand, h) => Array.from({ length: h }, () => ({ income: 10 + Math.floor(rand() * 5) })),
}

describe('quantile', () => {
  it('interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0)).toBe(1)
    expect(quantile([1, 2, 3, 4], 1)).toBe(4)
    expect(quantile([5], 0.9)).toBe(5)
    expect(Number.isNaN(quantile([], 0.5))).toBe(true)
  })
})

describe('runOnce', () => {
  it('produces one value per month per metric', () => {
    const path = [{ income: 1 }, { income: 2 }, { income: 3 }]
    const r = runOnce(toy, { start: 0 }, { spend: 0 }, path, mulberry32(1))
    expect(r.series.cash).toEqual([1, 3, 6])
    expect(r.final.cash).toBe(6)
  })
  it('supports time-varying levers', () => {
    const path = [{ income: 0 }, { income: 0 }]
    const r = runOnce(toy, { start: 10 }, m => ({ spend: m === 2 ? 5 : 1 }), path, mulberry32(1))
    expect(r.series.cash).toEqual([9, 4])
  })
})

describe('monteCarlo', () => {
  it('is reproducible for a seed and differs across seeds', () => {
    const a = monteCarlo(toy, { start: 0 }, { spend: 11 }, sampler, { runs: 20, horizon: 12, seed: 3 })
    const b = monteCarlo(toy, { start: 0 }, { spend: 11 }, sampler, { runs: 20, horizon: 12, seed: 3 })
    const c = monteCarlo(toy, { start: 0 }, { spend: 11 }, sampler, { runs: 20, horizon: 12, seed: 4 })
    expect(a.runs).toEqual(b.runs)
    expect(a.runs).not.toEqual(c.runs)
  })
  it('summary quantiles are ordered and mean of indicator is a probability', () => {
    const r = monteCarlo(toy, { start: 0 }, { spend: 12 }, sampler, { runs: 200, horizon: 6, seed: 9 })
    const cash = r.summary.cash!
    for (let m = 0; m < 6; m++) {
      expect(cash.p10[m]!).toBeLessThanOrEqual(cash.p50[m]!)
      expect(cash.p50[m]!).toBeLessThanOrEqual(cash.p90[m]!)
    }
    const pBroke = r.summary.broke!.mean[5]!
    expect(pBroke).toBeGreaterThan(0)
    expect(pBroke).toBeLessThan(1)
  })
})

describe('compare (common random numbers)', () => {
  it('isolates the decision effect exactly when scenario paths are shared', () => {
    const base = monteCarlo(toy, { start: 0 }, { spend: 5 }, sampler, { runs: 50, horizon: 4, seed: 1 })
    const dec = monteCarlo(toy, { start: 0 }, { spend: 7 }, sampler, { runs: 50, horizon: 4, seed: 1 })
    const c = compare(base.runs, dec.runs, { cash: true })
    // spending 2 more per month => delta cash is exactly -2*m in every run
    expect(c.delta.cash!.p10).toEqual([-2, -4, -6, -8])
    expect(c.delta.cash!.p90).toEqual([-2, -4, -6, -8])
    expect(c.winRate.cash).toEqual([0, 0, 0, 0])
  })
  it('honours higherIsBetter=false', () => {
    const base = monteCarlo(toy, { start: 0 }, { spend: 5 }, sampler, { runs: 10, horizon: 2, seed: 1 })
    const dec = monteCarlo(toy, { start: 0 }, { spend: 7 }, sampler, { runs: 10, horizon: 2, seed: 1 })
    const c = compare(base.runs, dec.runs, { cash: false })
    expect(c.winRate.cash).toEqual([1, 1])
  })
  it('rejects unequal run counts', () => {
    expect(() => compare([summarizeInput(1)], [], {})).toThrow()
  })
})

function summarizeInput(n: number) {
  return { cash: new Array(n).fill(0) }
}

describe('summarize', () => {
  it('handles empty input', () => {
    expect(summarize([])).toEqual({})
  })
})
