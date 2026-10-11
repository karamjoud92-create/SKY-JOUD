import { macroSampler, DEFAULT_MACRO, ramadanShare, seasonality, deterministicMacro, type MacroParams } from './scenario'
import { mulberry32 } from './rng'

const P = DEFAULT_MACRO

describe('ramadanShare', () => {
  it('covers Feb/Mar 2026 and nothing in Aug 2026', () => {
    expect(ramadanShare(2026, 2)).toBeGreaterThan(0.3)
    expect(ramadanShare(2026, 3)).toBeGreaterThan(0.5)
    expect(ramadanShare(2026, 8)).toBe(0)
  })
  it('never exceeds 1', () => {
    for (let y = 2025; y <= 2031; y++) for (let m = 1; m <= 12; m++) expect(ramadanShare(y, m)).toBeLessThanOrEqual(1)
  })
})

describe('seasonality', () => {
  it('boosts Ramadan months and the month before', () => {
    const jan = seasonality(P, 2026, 1)
    const feb = seasonality(P, 2026, 2)
    const aug = seasonality(P, 2026, 8)
    expect(jan).toBeGreaterThan((P.seasonByMonth[0] as number) * 1.1) // pre-Ramadan
    expect(feb).toBeGreaterThan(P.seasonByMonth[1] as number)
    expect(aug).toBeCloseTo(P.seasonByMonth[7] as number, 6)
  })
})

describe('macroSampler', () => {
  it('is deterministic per seed and yields horizon months with advancing calendar', () => {
    const s = macroSampler(P)
    const a = s.sample(mulberry32(5), 14)
    const b = s.sample(mulberry32(5), 14)
    expect(a).toEqual(b)
    expect(a.length).toBe(14)
    expect(a[0]!.calendarMonth).toBe(11)
    expect(a[1]!.calendarMonth).toBe(12)
    expect(a[2]!.calendarMonth).toBe(1)
    expect(a[2]!.year).toBe(2027)
  })
  it('all quantities stay in valid ranges', () => {
    const s = macroSampler(P)
    for (let seed = 1; seed <= 50; seed++) {
      for (const m of s.sample(mulberry32(seed), 36)) {
        expect(m.fx).toBeGreaterThan(0)
        expect(m.fxOfficial).toBeGreaterThan(0)
        expect(m.fxOfficial).toBeLessThanOrEqual(m.fx * 1.06)
        expect(m.costIndex).toBeGreaterThan(0)
        expect(m.ppIndex).toBeGreaterThan(0)
        expect(m.gridHours).toBeGreaterThanOrEqual(P.gridHoursMin)
        expect(m.gridHours).toBeLessThanOrEqual(P.gridHoursMax)
        expect(m.dieselUsd).toBeGreaterThan(0)
        expect(m.customsDelayWeeks).toBeGreaterThanOrEqual(0)
        expect(m.tariffRate).toBeGreaterThanOrEqual(0)
        expect(m.tariffRate).toBeLessThanOrEqual(1)
        expect(m.demandShock).toBeGreaterThan(0)
        expect(m.competitorPressure).toBeGreaterThanOrEqual(0.5)
        expect(m.competitorPressure).toBeLessThanOrEqual(2)
      }
    }
  })
  it('mean log FX change matches drift plus expected jumps, and jump frequency matches', () => {
    const s = macroSampler(P)
    let sum = 0
    let n = 0
    let jumps = 0
    for (let seed = 1; seed <= 400; seed++) {
      for (const m of s.sample(mulberry32(seed), 36)) {
        sum += m.fxLogChange
        n++
        if (m.jumped) jumps++
      }
    }
    const expected = P.fxDriftMonthly + P.fxJumpProb * P.fxJumpMean
    expect(Math.abs(sum / n - expected)).toBeLessThan(0.004)
    expect(Math.abs(jumps / n - P.fxJumpProb)).toBeLessThan(0.006)
  })
  it('with zero volatility and zero jumps the path equals the deterministic path', () => {
    const q: MacroParams = {
      ...P, fxVolMonthly: 0, fxJumpProb: 0, fxSpreadVol: 0, fxSpread0: P.fxSpreadMean, costInflationVol: 0, ppShockSd: 0, gridHoursSd: 0, dieselVolMonthly: 0,
      customsDelayWeeksSd: 0, customsSpikeProb: 0, tariffChangeProb: 0, demandShockProb: 0, competitorPressureVol: 0, supplierDisruptionProb: 0,
    }
    const a = macroSampler(q).sample(mulberry32(1), 12)
    const d = deterministicMacro(q, 12)
    for (let i = 0; i < 12; i++) {
      expect(a[i]!.fx).toBeCloseTo(d[i]!.fx, 6)
      expect(a[i]!.fxOfficial).toBeCloseTo(d[i]!.fxOfficial, 6)
      expect(a[i]!.costIndex).toBeCloseTo(d[i]!.costIndex, 6)
      expect(a[i]!.demandShock).toBe(1)
      expect(a[i]!.seasonality).toBeCloseTo(d[i]!.seasonality, 9)
    }
  })
  it('cost index rises faster when FX passes through', () => {
    const noPass = { ...P, costFxPassThrough: 0 }
    const a = macroSampler(P).sample(mulberry32(3), 36)
    const b = macroSampler(noPass).sample(mulberry32(3), 36)
    // same seed => same FX path; cost index with pass-through must be >= without
    expect(a[35]!.fx).toBeCloseTo(b[35]!.fx, 6)
    expect(a[35]!.costIndex).toBeGreaterThan(b[35]!.costIndex)
  })
})

describe('official vs parallel rate', () => {
  it('premium mean-reverts toward fxSpreadMean over the horizon', () => {
    const q: MacroParams = { ...P, fxSpread0: 0.3, fxSpreadVol: 0 }
    const path = macroSampler(q).sample(mulberry32(2), 36)
    const prem0 = path[0]!.fx / path[0]!.fxOfficial - 1
    const prem35 = path[35]!.fx / path[35]!.fxOfficial - 1
    expect(prem0).toBeLessThan(0.3)
    expect(prem35).toBeCloseTo(q.fxSpreadMean, 2)
  })
})
