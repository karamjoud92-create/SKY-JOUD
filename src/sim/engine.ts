/**
 * Generic simulation engine. Business-agnostic: a SimModel supplies init, step,
 * and metrics; the engine supplies deterministic seeding, Monte Carlo over
 * exogenous scenario paths, common random numbers so baseline and decision
 * runs face identical scenarios, and quantile summaries.
 */
import { mulberry32 } from './rng'

/** Metric name -> value per month (index 0 = end of month 1). */
export type Series = Record<string, number[]>

export interface SimModel<S, P, L, X> {
  /** Initial state from parameters. */
  init(params: P): S
  /**
   * Advance one month. `exo` is this month's exogenous (scenario) inputs,
   * `rand` is a per-run noise stream reserved for the model's own randomness.
   */
  step(state: S, params: P, levers: L, exo: X, month: number, rand: () => number): S
  /** Observable metrics of a state. Must return the same keys every call. */
  metrics(state: S, params: P, exo: X): Record<string, number>
}

/** A scenario sampler draws one full exogenous path for a run. */
export interface ScenarioSampler<X> {
  sample(rand: () => number, horizon: number): X[]
}

/** Levers may change over time: a constant, or a function of month (1-based). */
export type LeverSchedule<L> = L | ((month: number) => L)

export function leversAt<L>(schedule: LeverSchedule<L>, month: number): L {
  return typeof schedule === 'function' ? (schedule as (m: number) => L)(month) : schedule
}

export interface RunResult<S> {
  series: Series
  final: S
}

/** Split one seed into independent streams for exogenous sampling and model noise. */
function streams(seed: number, runIndex: number): { exo: () => number; noise: () => number } {
  const base = (seed * 1_000_003 + runIndex * 7919) >>> 0
  return { exo: mulberry32(base ^ 0x9e3779b9), noise: mulberry32(base ^ 0x7f4a7c15) }
}

export function runOnce<S, P, L, X>(
  model: SimModel<S, P, L, X>,
  params: P,
  levers: LeverSchedule<L>,
  exoPath: X[],
  noise: () => number,
): RunResult<S> {
  const horizon = exoPath.length
  let state = model.init(params)
  const series: Series = {}
  for (let m = 1; m <= horizon; m++) {
    const exo = exoPath[m - 1] as X
    state = model.step(state, params, leversAt(levers, m), exo, m, noise)
    const metrics = model.metrics(state, params, exo)
    for (const [k, v] of Object.entries(metrics)) {
      if (!series[k]) series[k] = new Array(horizon).fill(NaN)
      ;(series[k] as number[])[m - 1] = v
    }
  }
  return { series, final: state }
}

export interface MonteCarloOptions {
  runs: number
  horizon: number
  seed: number
}

export interface MonteCarloResult {
  runs: Series[]
  summary: Summary
}

export function monteCarlo<S, P, L, X>(
  model: SimModel<S, P, L, X>,
  params: P,
  levers: LeverSchedule<L>,
  sampler: ScenarioSampler<X>,
  opts: MonteCarloOptions,
): MonteCarloResult {
  const runs: Series[] = []
  for (let i = 0; i < opts.runs; i++) {
    const { exo, noise } = streams(opts.seed, i)
    const path = sampler.sample(exo, opts.horizon)
    runs.push(runOnce(model, params, levers, path, noise).series)
  }
  return { runs, summary: summarize(runs) }
}

export interface MetricSummary {
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  mean: number[]
}
export type Summary = Record<string, MetricSummary>

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sorted: number[], q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0] as number
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sorted[lo] as number
  const b = sorted[hi] as number
  return a + (b - a) * (pos - lo)
}

export function summarize(runs: Series[]): Summary {
  const out: Summary = {}
  if (runs.length === 0) return out
  const first = runs[0] as Series
  for (const key of Object.keys(first)) {
    const horizon = (first[key] as number[]).length
    const ms: MetricSummary = { p10: [], p25: [], p50: [], p75: [], p90: [], mean: [] }
    for (let m = 0; m < horizon; m++) {
      const col: number[] = []
      let sum = 0
      for (const r of runs) {
        const v = (r[key] as number[])[m] as number
        col.push(v)
        sum += v
      }
      col.sort((a, b) => a - b)
      ms.p10.push(quantile(col, 0.1))
      ms.p25.push(quantile(col, 0.25))
      ms.p50.push(quantile(col, 0.5))
      ms.p75.push(quantile(col, 0.75))
      ms.p90.push(quantile(col, 0.9))
      ms.mean.push(sum / runs.length)
    }
    out[key] = ms
  }
  return out
}

/**
 * Paired comparison: because baseline and decision use the same seeds, the
 * per-run difference isolates the decision's effect (common random numbers).
 */
export interface Comparison {
  /** Distribution of (decision - baseline) per metric per month. */
  delta: Summary
  /** Share of runs in which decision beats baseline on this metric at each month. */
  winRate: Record<string, number[]>
}

export function compare(baseline: Series[], decision: Series[], higherIsBetter: Record<string, boolean>): Comparison {
  if (baseline.length !== decision.length) throw new Error('paired comparison needs equal run counts')
  const deltas: Series[] = baseline.map((b, i) => {
    const d = decision[i] as Series
    const out: Series = {}
    for (const k of Object.keys(b)) {
      out[k] = (b[k] as number[]).map((v, m) => ((d[k] as number[])[m] as number) - v)
    }
    return out
  })
  const delta = summarize(deltas)
  const winRate: Record<string, number[]> = {}
  for (const k of Object.keys(delta)) {
    const horizon = (delta[k] as MetricSummary).p50.length
    const sign = higherIsBetter[k] === false ? -1 : 1
    winRate[k] = []
    for (let m = 0; m < horizon; m++) {
      let wins = 0
      for (const d of deltas) if (sign * ((d[k] as number[])[m] as number) > 0) wins++
      winRate[k].push(wins / deltas.length)
    }
  }
  return { delta, winRate }
}

/** Convenience: value of a metric summary at month index (1-based month). */
export function at(ms: MetricSummary, month: number): { p10: number; p50: number; p90: number; mean: number } {
  const i = month - 1
  return { p10: ms.p10[i] as number, p50: ms.p50[i] as number, p90: ms.p90[i] as number, mean: ms.mean[i] as number }
}
