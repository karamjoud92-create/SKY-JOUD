import { mixtureSampler, REGIMES, buildSampler, PRESETS } from './presets'
import { DEFAULT_MACRO } from './scenario'
import { mulberry32 } from './rng'

describe('mixtureSampler', () => {
  it('draws regimes in proportion to their weights', () => {
    const s = mixtureSampler(DEFAULT_MACRO, REGIMES)
    const counts: Record<string, number> = {}
    const n = 3000
    for (let i = 0; i < n; i++) {
      const r = s.regimeOf(mulberry32(i)())
      counts[r.key] = (counts[r.key] ?? 0) + 1
    }
    expect(Math.abs((counts.reopen ?? 0) / n - 0.45)).toBeLessThan(0.03)
    expect(Math.abs((counts.protracted ?? 0) / n - 0.4)).toBeLessThan(0.03)
    expect(Math.abs((counts.escalation ?? 0) / n - 0.15)).toBeLessThan(0.03)
  })
  it('escalation paths have higher diesel than reopen paths on average', () => {
    const re = buildSampler('reopen')
    const es = buildSampler('escalation')
    let a = 0
    let b = 0
    for (let i = 0; i < 100; i++) {
      a += re.sample(mulberry32(i), 12)[11]!.dieselUsd
      b += es.sample(mulberry32(i), 12)[11]!.dieselUsd
    }
    expect(b).toBeGreaterThan(a * 1.3)
  })
})

describe('buildSampler', () => {
  it('applies macro overrides and rejects unknown presets', () => {
    const s = buildSampler('calm', { fx0: 200 })
    expect(s.sample(mulberry32(1), 1)[0]!.fx).toBeCloseTo(200 * Math.exp(DEFAULT_MACRO.fxDriftMonthly), 6)
    expect(() => buildSampler('nope')).toThrow(/unknown scenario preset/)
    expect(Object.keys(PRESETS)).toContain('base')
  })
  it('calm has no jumps or shocks', () => {
    const s = buildSampler('calm')
    for (const m of s.sample(mulberry32(3), 36)) {
      expect(m.jumped).toBe(false)
      expect(m.demandShock).toBe(1)
      expect(m.supplierDisrupted).toBe(false)
    }
  })
})
