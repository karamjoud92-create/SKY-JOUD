/**
 * Macro scenario sampler for Syria. Draws one exogenous path per run.
 * Everything here is outside the company's control. Defaults are
 * PROVISIONAL placeholders until docs/01-research.md values are applied;
 * every parameter carries a note on what should set it.
 */
import type { ScenarioSampler } from './engine'
import { normal } from './rng'

export interface MacroParams {
  /** Local currency per USD at month 0. */
  fx0: number
  /** Expected log depreciation per month (0.01 = ~1% per month). */
  fxDriftMonthly: number
  /** Standard deviation of monthly log FX change, excluding jumps. */
  fxVolMonthly: number
  /** Probability per month of a devaluation jump. */
  fxJumpProb: number
  /** Mean log size of a jump (0.25 = ~28% depreciation). */
  fxJumpMean: number
  fxJumpSd: number
  /** Share of FX depreciation that passes into local-currency costs within the month. */
  costFxPassThrough: number
  /** Local cost inflation per month independent of FX. */
  costInflationMonthly: number
  costInflationVol: number
  /** Purchasing-power index: AR(1) shocks around a drift. 1 = start. */
  ppDriftMonthly: number
  ppShockSd: number
  ppPersistence: number
  /** Grid electricity hours per day. */
  gridHoursMean: number
  gridHoursSd: number
  gridHoursMin: number
  gridHoursMax: number
  /** Diesel price in USD per litre. */
  dieselUsd0: number
  dieselVolMonthly: number
  /** Customs and port clearance delay, weeks beyond nominal transit. */
  customsDelayWeeksMean: number
  customsDelayWeeksSd: number
  customsSpikeProb: number
  customsSpikeWeeks: number
  /** Import tariff rate on the company's goods, as a share of CIF. Step changes. */
  tariffRate0: number
  tariffChangeProb: number
  tariffChangeSd: number
  /** Multiplicative demand shocks with persistence (strikes, security, weather). */
  demandShockProb: number
  demandShockSd: number
  demandPersistence: number
  /** Competitor price pressure index, 1 = none, random walk. */
  competitorPressure0: number
  competitorPressureVol: number
  /** Probability per month that a foreign shipment is disrupted (delayed one extra month). */
  supplierDisruptionProb: number
  /** Calendar seasonality: 12 multipliers Jan..Dec, mean should be ~1. */
  seasonByMonth: number[]
  /** Extra multiplier applied to the calendar month(s) containing Ramadan and the month before. */
  ramadanBoost: number
  preRamadanBoost: number
  /** Calendar of the first simulated month. */
  startYear: number
  startMonth: number
}

export interface MacroMonth {
  month: number
  year: number
  calendarMonth: number
  fx: number
  fxLogChange: number
  jumped: boolean
  costIndex: number
  ppIndex: number
  gridHours: number
  dieselUsd: number
  customsDelayWeeks: number
  tariffRate: number
  demandShock: number
  competitorPressure: number
  supplierDisrupted: boolean
  seasonality: number
}

/** Approximate Gregorian start dates of Ramadan (year, month, day). Good to +-1 day. */
export const RAMADAN_STARTS: Array<[number, number, number]> = [
  [2025, 3, 1], [2026, 2, 18], [2027, 2, 8], [2028, 1, 28], [2029, 1, 16], [2030, 1, 5], [2031, 12, 26], [2032, 12, 14],
]

/** Share of a calendar month that falls inside Ramadan (29.5 days), 0..1. */
export function ramadanShare(year: number, month: number): number {
  const monthStart = Date.UTC(year, month - 1, 1)
  const monthEnd = Date.UTC(year, month, 1)
  let covered = 0
  for (const [ry, rm, rd] of RAMADAN_STARTS) {
    const rs = Date.UTC(ry, rm - 1, rd)
    const re = rs + 29.5 * 86400000
    const lo = Math.max(rs, monthStart)
    const hi = Math.min(re, monthEnd)
    if (hi > lo) covered += hi - lo
  }
  return Math.min(1, covered / (monthEnd - monthStart))
}

export function seasonality(p: MacroParams, year: number, calendarMonth: number): number {
  const base = p.seasonByMonth[calendarMonth - 1] ?? 1
  const share = ramadanShare(year, calendarMonth)
  const nextY = calendarMonth === 12 ? year + 1 : year
  const nextM = calendarMonth === 12 ? 1 : calendarMonth + 1
  const nextShare = ramadanShare(nextY, nextM)
  // Pre-Ramadan stocking by the trade happens in the month before Ramadan starts.
  const pre = share < 0.5 && nextShare > 0 ? p.preRamadanBoost : 1
  return base * (1 + (p.ramadanBoost - 1) * share) * pre
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function macroSampler(p: MacroParams): ScenarioSampler<MacroMonth> {
  return {
    sample(rand, horizon) {
      const out: MacroMonth[] = []
      let fx = p.fx0
      let costIndex = 1
      let ppDev = 0
      let diesel = p.dieselUsd0
      let tariff = p.tariffRate0
      let demandDev = 0
      let comp = p.competitorPressure0
      let year = p.startYear
      let cm = p.startMonth
      for (let m = 1; m <= horizon; m++) {
        const jumped = rand() < p.fxJumpProb
        const jump = jumped ? Math.max(0, p.fxJumpMean + p.fxJumpSd * normal(rand)) : 0
        const fxLogChange = p.fxDriftMonthly + p.fxVolMonthly * normal(rand) + jump
        fx = fx * Math.exp(fxLogChange)
        const costGrowth = p.costInflationMonthly + p.costInflationVol * normal(rand) + p.costFxPassThrough * Math.max(0, fxLogChange)
        costIndex = costIndex * Math.exp(Math.max(-0.5, costGrowth))
        ppDev = p.ppPersistence * ppDev + p.ppShockSd * normal(rand)
        const ppIndex = Math.exp(p.ppDriftMonthly * m + ppDev)
        const gridHours = clamp(p.gridHoursMean + p.gridHoursSd * normal(rand), p.gridHoursMin, p.gridHoursMax)
        diesel = Math.max(0.1, diesel * Math.exp(p.dieselVolMonthly * normal(rand)))
        const spike = rand() < p.customsSpikeProb ? p.customsSpikeWeeks : 0
        const customsDelayWeeks = Math.max(0, p.customsDelayWeeksMean + p.customsDelayWeeksSd * normal(rand) + spike)
        if (rand() < p.tariffChangeProb) tariff = clamp(tariff + p.tariffChangeSd * normal(rand), 0, 1)
        const shock = rand() < p.demandShockProb ? p.demandShockSd * normal(rand) : 0
        demandDev = p.demandPersistence * demandDev + shock
        const demandShock = Math.exp(clamp(demandDev, -1, 1))
        comp = clamp(comp * Math.exp(p.competitorPressureVol * normal(rand)), 0.5, 2)
        const supplierDisrupted = rand() < p.supplierDisruptionProb
        out.push({
          month: m, year, calendarMonth: cm, fx, fxLogChange, jumped, costIndex, ppIndex, gridHours, dieselUsd: diesel,
          customsDelayWeeks, tariffRate: tariff, demandShock, competitorPressure: comp, supplierDisrupted,
          seasonality: seasonality(p, year, cm),
        })
        cm++
        if (cm > 12) { cm = 1; year++ }
      }
      return out
    },
  }
}

/** A path with no randomness: drift only. Useful for a "no shocks" baseline and for tests. */
export function deterministicMacro(p: MacroParams, horizon: number): MacroMonth[] {
  const out: MacroMonth[] = []
  let fx = p.fx0
  let costIndex = 1
  let year = p.startYear
  let cm = p.startMonth
  for (let m = 1; m <= horizon; m++) {
    fx = fx * Math.exp(p.fxDriftMonthly)
    costIndex = costIndex * Math.exp(p.costInflationMonthly + p.costFxPassThrough * Math.max(0, p.fxDriftMonthly))
    out.push({
      month: m, year, calendarMonth: cm, fx, fxLogChange: p.fxDriftMonthly, jumped: false, costIndex,
      ppIndex: Math.exp(p.ppDriftMonthly * m), gridHours: p.gridHoursMean, dieselUsd: p.dieselUsd0,
      customsDelayWeeks: p.customsDelayWeeksMean, tariffRate: p.tariffRate0, demandShock: 1,
      competitorPressure: p.competitorPressure0, supplierDisrupted: false, seasonality: seasonality(p, year, cm),
    })
    cm++
    if (cm > 12) { cm = 1; year++ }
  }
  return out
}

/**
 * PROVISIONAL defaults. Each value must be replaced or confirmed from
 * docs/01-research.md. Confidence is low until then.
 */
export const PROVISIONAL_MACRO: MacroParams = {
  fx0: 11000, // local currency per USD; set from current market rate (research)
  fxDriftMonthly: 0.01,
  fxVolMonthly: 0.04,
  fxJumpProb: 0.03,
  fxJumpMean: 0.2,
  fxJumpSd: 0.1,
  costFxPassThrough: 0.5,
  costInflationMonthly: 0.015,
  costInflationVol: 0.01,
  ppDriftMonthly: 0.002,
  ppShockSd: 0.03,
  ppPersistence: 0.7,
  gridHoursMean: 8,
  gridHoursSd: 3,
  gridHoursMin: 1,
  gridHoursMax: 24,
  dieselUsd0: 0.9,
  dieselVolMonthly: 0.06,
  customsDelayWeeksMean: 2,
  customsDelayWeeksSd: 1,
  customsSpikeProb: 0.05,
  customsSpikeWeeks: 4,
  tariffRate0: 0.2,
  tariffChangeProb: 0.03,
  tariffChangeSd: 0.08,
  demandShockProb: 0.08,
  demandShockSd: 0.1,
  demandPersistence: 0.6,
  competitorPressure0: 1,
  competitorPressureVol: 0.03,
  supplierDisruptionProb: 0.04,
  seasonByMonth: [0.95, 0.95, 1.0, 1.0, 1.0, 1.05, 1.1, 1.1, 1.0, 0.95, 0.95, 0.95],
  ramadanBoost: 1.25,
  preRamadanBoost: 1.15,
  startYear: 2026,
  startMonth: 11,
}
