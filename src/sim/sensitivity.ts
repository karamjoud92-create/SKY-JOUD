/**
 * "What would have to be true": swing each parameter between its low and high
 * value with everything else at base, and report how the decision's effect on
 * a metric at the horizon changes (tornado). Then, for each parameter, find the
 * value at which the decision's win rate crosses a target (break-even).
 */
import { runDecision, type RunOptions } from './run'
import { registry, setPath, type DecisionFile, type ParamRange, type ModelEntry } from '../models/registry'

export interface TornadoRow {
  path: string
  label: string
  low: number
  high: number
  /** Decision-minus-baseline p50 at the horizon with the parameter at low / base / high. */
  deltaAtLow: number
  deltaAtBase: number
  deltaAtHigh: number
  winRateAtLow: number
  winRateAtHigh: number
  /** |deltaAtHigh - deltaAtLow|, for sorting. */
  swing: number
}

function optsWith(opts: RunOptions, path: string, value: number): RunOptions {
  if (path.startsWith('macro.')) return { ...opts, macro: setPath(opts.macro ?? {}, path.slice(6), value) }
  if (path.startsWith('params.')) return { ...opts, params: setPath(opts.params ?? {}, path.slice(7), value) }
  throw new Error(`sensitivity path must start with "macro." or "params.": ${path}`)
}

function deltaAtHorizon(decision: DecisionFile, opts: RunOptions, metric: string): { delta: number; winRate: number } {
  const r = runDecision(decision, { ...opts, checkpoints: [opts.horizon] })
  const row = r.rows.find(x => x.metric === metric && x.month === opts.horizon)
  if (!row) throw new Error(`metric ${metric} not produced by model ${opts.model}`)
  return { delta: row.delta.p50, winRate: row.winRate }
}

export function tornado(decision: DecisionFile, opts: RunOptions, metric: string, ranges?: ParamRange[]): TornadoRow[] {
  const entry = registry[opts.model] as ModelEntry | undefined
  if (!entry) throw new Error(`unknown model ${opts.model}`)
  const rs = ranges ?? entry.sensitivityRanges
  const base = deltaAtHorizon(decision, opts, metric)
  const rows: TornadoRow[] = rs.map(r => {
    const lo = deltaAtHorizon(decision, optsWith(opts, r.path, r.low), metric)
    const hi = deltaAtHorizon(decision, optsWith(opts, r.path, r.high), metric)
    return {
      path: r.path, label: r.label, low: r.low, high: r.high,
      deltaAtLow: lo.delta, deltaAtBase: base.delta, deltaAtHigh: hi.delta,
      winRateAtLow: lo.winRate, winRateAtHigh: hi.winRate,
      swing: Math.abs(hi.delta - lo.delta),
    }
  })
  return rows.sort((a, b) => b.swing - a.swing)
}

export interface BreakEven {
  path: string
  label: string
  /** Parameter value at which win rate crosses target, or null if it never does inside [low, high]. */
  threshold: number | null
  /** 'wins_above' means the decision wins when the parameter is above the threshold. */
  direction: 'wins_above' | 'wins_below' | 'always_wins' | 'never_wins'
  winRateAtLow: number
  winRateAtHigh: number
}

/** Bisection on win rate across a range. Monotonic win rate assumed (true for most single parameters). */
export function breakEven(decision: DecisionFile, opts: RunOptions, metric: string, range: ParamRange, targetWinRate = 0.5, iterations = 10): BreakEven {
  const wr = (v: number) => deltaAtHorizon(decision, optsWith(opts, range.path, v), metric).winRate
  const lo = wr(range.low)
  const hi = wr(range.high)
  const base = { path: range.path, label: range.label, winRateAtLow: lo, winRateAtHigh: hi }
  const loWins = lo >= targetWinRate
  const hiWins = hi >= targetWinRate
  if (loWins && hiWins) return { ...base, threshold: null, direction: 'always_wins' }
  if (!loWins && !hiWins) return { ...base, threshold: null, direction: 'never_wins' }
  let a = range.low
  let b = range.high
  let aWins = loWins
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2
    const midWins = wr(mid) >= targetWinRate
    if (midWins === aWins) a = mid
    else b = mid
  }
  return { ...base, threshold: (a + b) / 2, direction: hiWins ? 'wins_above' : 'wins_below' }
}

export function whatMustBeTrue(decision: DecisionFile, opts: RunOptions, metric: string, ranges?: ParamRange[]): BreakEven[] {
  const entry = registry[opts.model] as ModelEntry | undefined
  if (!entry) throw new Error(`unknown model ${opts.model}`)
  return (ranges ?? entry.sensitivityRanges).map(r => breakEven(decision, opts, metric, r))
}
