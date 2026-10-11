/**
 * Registry of runnable models. Each entry bundles a SimModel with its default
 * parameters, lever defaults, scenario sampler and metric metadata, so the CLI
 * and the UI can run any model by name without knowing its types.
 */
import type { SimModel, ScenarioSampler, LeverSchedule } from '../sim/engine'
import type { MacroMonth } from '../sim/scenario'
import { buildSampler } from '../sim/presets'

export interface MetricMeta {
  label: string
  higherIsBetter: boolean
  /** 'money' formats in local currency, 'pct' as percent, 'days', 'ratio', 'count'. */
  unit: 'money' | 'pct' | 'days' | 'ratio' | 'count' | 'prob'
  /** Show in the headline table. */
  headline?: boolean
}

export interface ModelEntry<S = unknown, P = unknown, L = unknown, X = unknown> {
  name: string
  description: string
  model: SimModel<S, P, L, X>
  defaultParams: P
  defaultLevers: L
  /** Build the exogenous sampler for a named scenario preset, with optional macro overrides. */
  sampler(preset: string, macroOverride?: Record<string, unknown>): ScenarioSampler<X>
  metrics: Record<string, MetricMeta>
  /** Parameter ranges for sensitivity sweeps: dotted path under "params." or "macro.". */
  sensitivityRanges: ParamRange[]
  /** Apply a partial lever override on top of a lever set (deep merge for nested objects). */
  mergeLevers(base: L, override: Record<string, unknown>): L
  mergeParams(base: P, override: Record<string, unknown>): P
}

/** Generic deep merge for plain objects; arrays and primitives are replaced. */
export function deepMerge<T>(base: T, override: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(override)) {
    const cur = out[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = deepMerge(cur, v as Record<string, unknown>)
    } else out[k] = v
  }
  return out as T
}

/** A parameter swing for tornado and break-even analysis. */
export interface ParamRange {
  /** "params.x.y" for model parameters, "macro.x" for scenario parameters. */
  path: string
  label: string
  low: number
  high: number
}

/** Set a dotted path on a plain object copy. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.')
  const override: Record<string, unknown> = {}
  let cur = override
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {}
    cur[parts[i] as string] = next
    cur = next
  }
  cur[parts[parts.length - 1] as string] = value
  return deepMerge(obj, override)
}

/** A decision as written in a JSON file or produced by the Claude layer. */
export interface DecisionFile {
  title?: string
  description?: string
  /** Lever overrides applied from month 1 (or `from`). */
  levers?: Record<string, unknown>
  from?: number
  /** Time-varying overrides. Each entry applies from its month until the next entry. */
  schedule?: Array<{ from: number; levers: Record<string, unknown> }>
  /** Parameter overrides (structural assumptions the decision changes, e.g. a new warehouse). */
  params?: Record<string, unknown>
  /** Free text: assumptions the author made, echoed in output. */
  assumptions?: string[]
}

export function leverScheduleFor<L>(entry: ModelEntry<unknown, unknown, L, unknown>, d: DecisionFile): LeverSchedule<L> {
  const base = entry.defaultLevers
  const steps: Array<{ from: number; levers: Record<string, unknown> }> = []
  if (d.levers) steps.push({ from: d.from ?? 1, levers: d.levers })
  if (d.schedule) steps.push(...d.schedule)
  if (steps.length === 0) return base
  steps.sort((a, b) => a.from - b.from)
  return (month: number) => {
    let cur = base
    for (const s of steps) if (month >= s.from) cur = entry.mergeLevers(cur, s.levers)
    return cur
  }
}

/* ---------- toy model, kept as the smoke-test entry ---------- */
interface ToyS { cash: number }
interface ToyP { start: number; incomeScale: number; interest: number }
interface ToyL { spend: number }

const toy: ModelEntry<ToyS, ToyP, ToyL, MacroMonth> = {
  name: 'toy',
  description: 'Smoke-test model: cash earns interest, grows with purchasing power, shrinks with spend.',
  model: {
    init: p => ({ cash: p.start }),
    step: (s, p, l, x) => ({ cash: s.cash * (1 + p.interest) + p.incomeScale * x.ppIndex * 100 - l.spend }),
    metrics: s => ({ cash: s.cash, cashNegative: s.cash < 0 ? 1 : 0 }),
  },
  defaultParams: { start: 500, incomeScale: 1, interest: 0.01 },
  defaultLevers: { spend: 90 },
  sampler: (preset, macro) => buildSampler(preset, macro),
  metrics: {
    cash: { label: 'Cash', higherIsBetter: true, unit: 'money', headline: true },
    cashNegative: { label: 'P(cash < 0)', higherIsBetter: false, unit: 'prob', headline: true },
  },
  sensitivityRanges: [
    { path: 'params.interest', label: 'Monthly interest', low: 0, high: 0.03 },
    { path: 'params.incomeScale', label: 'Income scale', low: 0.5, high: 1.5 },
    { path: 'macro.ppDriftMonthly', label: 'Purchasing power drift', low: -0.003, high: 0.008 },
  ],
  mergeLevers: (b, o) => deepMerge(b, o),
  mergeParams: (b, o) => deepMerge(b, o),
}

export const registry: Record<string, ModelEntry<any, any, any, any>> = { toy }
