/**
 * One call that the CLI, the UI and the Claude layer all use: run a decision
 * against "do nothing" on identical scenarios and summarise.
 */
import { monteCarlo, compare, at, type Summary, type Comparison } from './engine'
import { registry, leverScheduleFor, type DecisionFile, type ModelEntry } from '../models/registry'

export interface RunOptions {
  model: string
  runs: number
  horizon: number
  seed: number
  checkpoints?: number[]
  /** Scenario preset key (default "base"). The world both baseline and decision live in. */
  scenario?: string
  /** Macro parameter overrides applied to both baseline and decision. */
  macro?: Record<string, unknown>
  /** Model parameter overrides applied to BOTH baseline and decision (sensitivity sweeps use this). */
  params?: Record<string, unknown>
}

export interface CheckpointRow {
  metric: string
  label: string
  month: number
  baseline: { p10: number; p50: number; p90: number; mean: number }
  decision: { p10: number; p50: number; p90: number; mean: number }
  delta: { p10: number; p50: number; p90: number; mean: number }
  winRate: number
}

export interface RunReport {
  model: string
  title: string
  options: RunOptions
  assumptions: string[]
  baseline: Summary
  decision: Summary
  comparison: Comparison
  rows: CheckpointRow[]
}

export function runDecision(decision: DecisionFile, opts: RunOptions): RunReport {
  const entry = registry[opts.model] as ModelEntry | undefined
  if (!entry) throw new Error(`unknown model "${opts.model}"; known: ${Object.keys(registry).join(', ')}`)
  const shared = opts.params ? entry.mergeParams(entry.defaultParams, opts.params) : entry.defaultParams
  const params = decision.params ? entry.mergeParams(shared, decision.params) : shared
  const mc = { runs: opts.runs, horizon: opts.horizon, seed: opts.seed }
  const sampler = entry.sampler(opts.scenario ?? 'base', opts.macro)
  const base = monteCarlo(entry.model, shared, entry.defaultLevers, sampler, mc)
  const dec = monteCarlo(entry.model, params, leverScheduleFor(entry, decision), sampler, mc)
  const higher: Record<string, boolean> = {}
  for (const [k, m] of Object.entries(entry.metrics)) higher[k] = m.higherIsBetter
  const comparison = compare(base.runs, dec.runs, higher)
  const checkpoints = (opts.checkpoints ?? [6, 12, 24, 36]).filter(m => m <= opts.horizon)
  if (!checkpoints.includes(opts.horizon)) checkpoints.push(opts.horizon)
  const rows: CheckpointRow[] = []
  for (const [metric, meta] of Object.entries(entry.metrics)) {
    const b = base.summary[metric]
    const d = dec.summary[metric]
    const dl = comparison.delta[metric]
    if (!b || !d || !dl) continue
    for (const month of checkpoints) {
      rows.push({
        metric, label: meta.label, month,
        baseline: at(b, month), decision: at(d, month), delta: at(dl, month),
        winRate: comparison.winRate[metric]?.[month - 1] ?? NaN,
      })
    }
  }
  return {
    model: opts.model, title: decision.title ?? 'untitled decision', options: opts,
    assumptions: decision.assumptions ?? [], baseline: base.summary, decision: dec.summary, comparison, rows,
  }
}
