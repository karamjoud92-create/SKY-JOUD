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
  /** Share of FX depreciation that eventually passes into local-currency costs. */
  costFxPassThrough: number
  /** First-order lag, months, over which that pass-through arrives (0 = same month). */
  costFxPassThroughLagMonths: number
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
      let pendingPassThrough = 0
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
        pendingPassThrough += p.costFxPassThrough * Math.max(0, fxLogChange)
        const release = p.costFxPassThroughLagMonths <= 0 ? pendingPassThrough : pendingPassThrough * (1 - Math.exp(-1 / p.costFxPassThroughLagMonths))
        pendingPassThrough -= release
        const costGrowth = p.costInflationMonthly + p.costInflationVol * normal(rand) + release
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
  let pending = 0
  let year = p.startYear
  let cm = p.startMonth
  for (let m = 1; m <= horizon; m++) {
    fx = fx * Math.exp(p.fxDriftMonthly)
    pending += p.costFxPassThrough * Math.max(0, p.fxDriftMonthly)
    const release = p.costFxPassThroughLagMonths <= 0 ? pending : pending * (1 - Math.exp(-1 / p.costFxPassThroughLagMonths))
    pending -= release
    costIndex = costIndex * Math.exp(p.costInflationMonthly + release)
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
  // Parallel rate 135.5-136.5 new SYP/USD mid-Sept 2026; official held at 122 since 26 Apr 2026. Brief section 2 (FX rows), corroborated by two lenses.
  // Convention: fx0 and dieselUsd0 are both at the PARALLEL rate.
  fx0: 136,
  // Parallel +20 pct Jan-Sept 2026, observed 2.3 pct/month log including the Sept jump. Brief: fxDriftMonthly 0.015 (0.008-0.025). Estimate.
  fxDriftMonthly: 0.015,
  // Brief: fxVolMonthly 0.035 (0.02-0.05). Estimate; no dated daily series retrieved.
  fxVolMonthly: 0.035,
  // 10-30 pct moves around shocks (Dec 2024, Sept 2026). Brief: fxJumpProb 0.04 (0.02-0.08), fxJumpMean 0.18 log (0.10-0.25), fxJumpSd 0.08. Estimates.
  fxJumpProb: 0.04,
  fxJumpMean: 0.18,
  fxJumpSd: 0.08,
  // Parallel premium ~0 pct Jan 2026, 7 pct Aug, 10.6-12 pct Sept 2026; CBS band +-7 pct breached on most stress days. Brief section 2, corroborated.
  fxSpread0: 0.11,
  fxSpreadMean: 0.08,
  fxSpreadReversion: 0.15,
  fxSpreadVol: 0.02,
  // Import-heavy cost basket; dollar-quoted pricing with SYP settlement. Brief: 0.7 (0.6-0.8). Estimate, single lens.
  costFxPassThrough: 0.7,
  // Brief L3: pass-through arrives within 1-2 months (first-order). Estimate.
  costFxPassThroughLagMonths: 1.5,
  // Non-FX component of local cost inflation. Brief: 0.008 (0.004-0.015); with pass-through the total is ~2.0-2.4 pct/month, i.e. 27-33 pct/yr, matching CPI 2026 ~25 pct y/y. Estimate.
  costInflationMonthly: 0.008,
  costInflationVol: 0.02,
  // Real demand growth from returnees (+0.2-0.4 pct/month consumer base) and IMF >10 pct GDP 2026. Brief: 0.004 (-0.003 to +0.008). Estimate.
  ppDriftMonthly: 0.004,
  // AR(1) noise on purchasing power. No source in the brief (critic pass, 11 Oct 2026): pure estimates until Sky Joud supplies 24-36 months of unit sales (brief section 8, item 1).
  ppShockSd: 0.03,
  ppPersistence: 0.7,
  // Damascus grid 2-6 h/day, pipeline sabotage shocks; brief: gridHoursMean 5, sd 1.5, min 1, max 12. Corroborated on hours; parameters are estimates.
  gridHoursMean: 5,
  gridHoursSd: 1.5,
  gridHoursMin: 1,
  gridHoursMax: 12,
  // Diesel 150 (industrial) to 175 (standard) new SYP/L from Sept 2026 = 1.10-1.29 USD/L at the parallel rate. Brief: dieselUsd0 1.20, dieselVolMonthly 0.08 (20-40 pct policy steps every 1-3 months). Corroborated price; vol is an estimate.
  dieselUsd0: 1.2,
  dieselVolMonthly: 0.08,
  // Clearance 7-10 business days average, some goods 5-14 days; single-window centre since Jul 2026. Brief: customsDelayWeeksMean 1.5 (1-3), sd 1.0, customsSpikeProb 0.06, customsSpikeWeeks 3 (valuation disputes, route closures). Low confidence, vendor pages.
  customsDelayWeeksMean: 1.5,
  customsDelayWeeksSd: 1,
  customsSpikeProb: 0.06,
  customsSpikeWeeks: 3,
  // Decree 110/2026 (1 Jun 2026): ~40-45 pct ad valorem on finished processed foods, 15 pct raw oils and inputs, staples exempt; official schedule NOT read, two analytical Arabic sources. This value is the FINISHED-GOODS rate; the business model scales it per product family (inputs ~0.375x, staples 0x). Brief: tariffChangeProb 0.04, tariffChangeSd 0.10 (three regime changes in 20 months).
  tariffRate0: 0.4,
  tariffChangeProb: 0.04,
  tariffChangeSd: 0.1,
  // 3-6 significant security or logistics shocks per year plus pipeline sabotage. Brief: demandShockProb 0.12 (0.08-0.20), demandShockSd 0.10, demandPersistence 0.6. Estimates.
  demandShockProb: 0.12,
  demandShockSd: 0.1,
  demandPersistence: 0.6,
  // Market-wide index, 1 = today. The business model applies 1.15 (1.0-1.3) for own-manufactured lines facing Turkish imports reported 30-40 pct cheaper (low confidence) and 1.0 for imported brands. Brief: competitorPressureVol 0.04 (0.03-0.05).
  competitorPressure0: 1,
  competitorPressureVol: 0.04,
  // Route closures (Lebanon 4 days Apr 2026, Jordan truck ban, Hormuz diversions). Brief: 0.06 (0.04-0.12; 0.10-0.15 under a protracted Hormuz closure). Estimate.
  supplierDisruptionProb: 0.06,
  // No Syrian monthly F&B seasonality data found in any sweep. Keep until Sky Joud supplies 24+ months of sales. Estimate.
  seasonByMonth: [0.95, 0.95, 1.0, 1.0, 1.0, 1.05, 1.1, 1.1, 1.0, 0.95, 0.95, 0.95],
  // Ramadan uplift and pre-Ramadan trade stocking. Estimates, unverified; replace with company history.
  ramadanBoost: 1.25,
  preRamadanBoost: 1.15,
  startYear: 2026,
  startMonth: 11,
}

/** @deprecated use DEFAULT_MACRO */
export const PROVISIONAL_MACRO = DEFAULT_MACRO
