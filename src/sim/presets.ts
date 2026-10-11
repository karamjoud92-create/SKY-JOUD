/**
 * Named macro scenarios. A scenario is the world the business lives in, so
 * baseline and decision always run under the same one. "base" is a weighted
 * mixture of the brief's three Hormuz regimes (docs/01-research.md, Macro
 * table, Hormuz row: A reopen 45, B protracted 40, C escalation 15). Each
 * regime's parameter shifts are the brief's finder estimates.
 */
import type { ScenarioSampler } from './engine'
import { macroSampler, DEFAULT_MACRO, type MacroParams, type MacroMonth } from './scenario'
import { deepMerge } from '../models/registry'

export interface Regime {
  key: string
  label: string
  weight: number
  overrides: Partial<MacroParams>
}

export const REGIMES: Regime[] = [
  {
    key: 'reopen', label: 'Hormuz reopens within 3-6 months', weight: 0.45,
    // Brent 75-85, Syrian fuel -15-25 pct, freight surcharges unwind. Estimate.
    overrides: { dieselUsd0: 1.0, dieselVolMonthly: 0.06, supplierDisruptionProb: 0.04, fxDriftMonthly: 0.012, customsSpikeProb: 0.05 },
  },
  {
    key: 'protracted', label: 'Hormuz closed through 2027', weight: 0.40,
    // Brent 95-120, fuel +20-40 pct, imported inputs +10-25 pct, disruption 0.10-0.15. Estimate.
    overrides: { dieselUsd0: 1.5, dieselVolMonthly: 0.09, supplierDisruptionProb: 0.12, fxDriftMonthly: 0.02, costInflationMonthly: 0.012, customsSpikeProb: 0.08 },
  },
  {
    key: 'escalation', label: 'Regional escalation', weight: 0.15,
    // Brent >130, FX break risk, more security shocks. Estimate.
    overrides: { dieselUsd0: 1.8, dieselVolMonthly: 0.12, supplierDisruptionProb: 0.15, fxDriftMonthly: 0.025, fxJumpProb: 0.08, demandShockProb: 0.2, costInflationMonthly: 0.015, gridHoursMean: 4 },
  },
]

/** Draw a regime by weight on the first uniform, then sample that regime's path. */
export function mixtureSampler(base: MacroParams, regimes: Regime[]): ScenarioSampler<MacroMonth> & { regimeOf: (firstDraw: number) => Regime } {
  const total = regimes.reduce((a, r) => a + r.weight, 0)
  const samplers = regimes.map(r => macroSampler(deepMerge(base, r.overrides as Record<string, unknown>)))
  const regimeOf = (u: number): Regime => {
    let acc = 0
    for (const r of regimes) {
      acc += r.weight / total
      if (u < acc) return r
    }
    return regimes[regimes.length - 1] as Regime
  }
  return {
    regimeOf,
    sample(rand, horizon) {
      const u = rand()
      const idx = regimes.indexOf(regimeOf(u))
      return (samplers[idx] as ScenarioSampler<MacroMonth>).sample(rand, horizon)
    },
  }
}

export interface ScenarioPreset {
  key: string
  label: string
  description: string
  /** Build the sampler from a (possibly overridden) base parameter set. */
  build(base: MacroParams): ScenarioSampler<MacroMonth>
}

export const PRESETS: Record<string, ScenarioPreset> = {
  base: {
    key: 'base', label: 'Base (weighted mixture)', description: 'Each run draws one of the three Hormuz regimes by weight 45/40/15, then samples a full macro path from it.',
    build: base => mixtureSampler(base, REGIMES),
  },
  reopen: { key: 'reopen', label: REGIMES[0]!.label, description: 'Only the reopen regime.', build: base => macroSampler(deepMerge(base, REGIMES[0]!.overrides as Record<string, unknown>)) },
  protracted: { key: 'protracted', label: REGIMES[1]!.label, description: 'Only the protracted-closure regime.', build: base => macroSampler(deepMerge(base, REGIMES[1]!.overrides as Record<string, unknown>)) },
  escalation: { key: 'escalation', label: REGIMES[2]!.label, description: 'Only the escalation regime.', build: base => macroSampler(deepMerge(base, REGIMES[2]!.overrides as Record<string, unknown>)) },
  calm: {
    key: 'calm', label: 'Calm (no jumps, no shocks)', description: 'Drift only: useful to see the decision\'s mechanics without noise.',
    build: base => macroSampler({ ...base, fxVolMonthly: 0, fxJumpProb: 0, fxSpreadVol: 0, costInflationVol: 0, ppShockSd: 0, gridHoursSd: 0, dieselVolMonthly: 0, customsDelayWeeksSd: 0, customsSpikeProb: 0, tariffChangeProb: 0, demandShockProb: 0, competitorPressureVol: 0, supplierDisruptionProb: 0 }),
  },
}

export function buildSampler(preset: string, macroOverride?: Record<string, unknown>): ScenarioSampler<MacroMonth> {
  const p = PRESETS[preset]
  if (!p) throw new Error(`unknown scenario preset "${preset}"; known: ${Object.keys(PRESETS).join(', ')}`)
  const base = macroOverride ? deepMerge(DEFAULT_MACRO, macroOverride) : DEFAULT_MACRO
  return p.build(base)
}
