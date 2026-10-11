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
  /** Parallel-over-official premium at month 0 (0.11 = parallel is 11% above official). Customs is valued at the official rate. */
  fxSpread0: number
  /** Long-run mean of the premium and the monthly share of the gap closed (mean reversion). */
  fxSpreadMean: number
  fxSpreadReversion: number
  fxSpreadVol: number
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
  /** Parallel (cash market) rate, local currency per USD. The rate at which cash USD is actually bought and sold. */
  fx: number
  /** Official (central bank bulletin) rate, used for customs valuation and bank-channel payments. */
  fxOfficial: number
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
      let spread = p.fxSpread0
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
        spread = clamp(spread + p.fxSpreadReversion * (p.fxSpreadMean - spread) + p.fxSpreadVol * normal(rand), -0.05, 0.6)
        const fxOfficial = fx / (1 + spread)
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
          month: m, year, calendarMonth: cm, fx, fxOfficial, fxLogChange, jumped, costIndex, ppIndex, gridHours, dieselUsd: diesel,
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
      month: m, year, calendarMonth: cm, fx, fxOfficial: fx / (1 + p.fxSpreadMean), fxLogChange: p.fxDriftMonthly, jumped: false, costIndex,
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
 * Default macro parameters, Damascus, start November 2026, new Syrian pounds.
 * Each value cites docs/01-research.md (the brief) by section. Confidence as
 * the brief gives it. Replace from company data where the brief says
 * "estimate".
 */
export const DEFAULT_MACRO: MacroParams = {
  // Parallel rate ~136 new SYP/USD mid-Sept 2026, official held ~122 since Apr 2026 (brief: Macro, FX rows; corroborated by two lenses).
  fx0: 136,
  // Official weakened ~10% and parallel ~20% Jan-Sept 2026; Aug-Sept +4.5%. ~1.5%/month drift (brief: Macro FX). Estimate.
  fxDriftMonthly: 0.015,
  // Monthly swings of several percent outside jumps. Estimate from the 2026 path.
  fxVolMonthly: 0.04,
  // Discrete devaluation events: the Sept 2026 fuel shock widened the premium; a break on a bad Hormuz or fiscal path is plausible. Estimate.
  fxJumpProb: 0.03,
  fxJumpMean: 0.2,
  fxJumpSd: 0.1,
  // Parallel premium ~0% Jan 2026, 7% Aug, 10-12% Sept 2026 (brief: Macro, CBS band row). Mean-reverting, breaches band often.
  fxSpread0: 0.11,
  fxSpreadMean: 0.08,
  fxSpreadReversion: 0.15,
  fxSpreadVol: 0.02,
  // Importers price in USD and pass depreciation into SYP prices within weeks (brief: Sector, trade credit row). Estimate.
  costFxPassThrough: 0.6,
  // CPI 15-30% y/y in 2026 with monthly spikes of 1-6.5%; food ~1.3x headline (brief: Macro inflation rows). 1.8%/month ~ 24%/yr.
  costInflationMonthly: 0.018,
  costInflationVol: 0.015,
  // Real demand growth 5-12%/yr from returns (+0.2-0.4%/month consumer base) and >10% GDP growth (brief: Macro returnee and IMF rows). 0.5%/month.
  ppDriftMonthly: 0.005,
  ppShockSd: 0.03,
  ppPersistence: 0.7,
  // Damascus grid 4-6 h/day base, range 2-8, pipeline sabotage shocks (brief: Macro electricity rows; corroborated).
  gridHoursMean: 5,
  gridHoursSd: 1.5,
  gridHoursMin: 1,
  gridHoursMax: 12,
  // Diesel 150 new SYP/L industrial, 175 standard, Sept 2026 = $1.10-1.45/L at parallel (brief: Macro fuel row; corroborated). Use 1.25 for a mixed fleet/genset buyer.
  dieselUsd0: 1.25,
  // Discrete +28-40% policy jumps happened; model as volatility with fat months. Estimate.
  dieselVolMonthly: 0.08,
  // Port dwell "days to weeks"; Nasib backlog 200-300 trucks; Turkish transloading delays (brief: Sector ports and routes rows). 2 weeks mean. Estimate.
  customsDelayWeeksMean: 2,
  customsDelayWeeksSd: 1,
  // 3-6 significant security/logistics shocks per year closing a route 3-14 days (brief: Sector security row).
  customsSpikeProb: 0.3,
  customsSpikeWeeks: 1.5,
  // Decree 110/2026: ~0% staples, 15% inputs, 40-45% finished processed foods ad valorem on CIF at the official rate. Medium-low confidence; official schedule not accessed. Use 0.3 as a blended F&B importer default.
  tariffRate0: 0.3,
  tariffChangeProb: 0.03,
  tariffChangeSd: 0.08,
  // Demand shocks from security events and price spikes (brief: Sector security and retail price rows).
  demandShockProb: 0.1,
  demandShockSd: 0.1,
  demandPersistence: 0.6,
  // Turkish imports undercut local manufacturing 30-40% (low confidence); Gulf entrants 2027+. Index 1 = today's pressure.
  competitorPressure0: 1,
  competitorPressureVol: 0.03,
  // Shipment disruption: route closures and transloading damage (brief: Sector routes rows). Estimate.
  supplierDisruptionProb: 0.05,
  // Calendar seasonality for packaged F&B in Syria: summer beverages up, winter flat. Estimate; replace with company sales history.
  seasonByMonth: [0.95, 0.95, 1.0, 1.0, 1.0, 1.05, 1.1, 1.1, 1.0, 0.95, 0.95, 0.95],
  // Ramadan: trade stocks up the month before; consumption of many F&B categories rises during. Estimate; replace with company history.
  ramadanBoost: 1.25,
  preRamadanBoost: 1.15,
  startYear: 2026,
  startMonth: 11,
}

/** @deprecated use DEFAULT_MACRO */
export const PROVISIONAL_MACRO = DEFAULT_MACRO
