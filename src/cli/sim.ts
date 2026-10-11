/**
 * CLI: npm run sim -- --decision path.json [--model toy] [--runs 300] [--horizon 36] [--seed 1] [--json]
 * With no --decision it runs the baseline against itself (a smoke test).
 */
import { readFileSync } from 'node:fs'
import { runDecision, type RunReport } from '../sim/run'
import { registry, type DecisionFile } from '../models/registry'

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const decisionPath = arg('decision')
const decision: DecisionFile = decisionPath ? JSON.parse(readFileSync(decisionPath, 'utf8')) : { title: 'baseline vs baseline' }
const opts = {
  model: arg('model', 'toy')!,
  runs: Number(arg('runs', '300')),
  horizon: Number(arg('horizon', '36')),
  seed: Number(arg('seed', '1')),
}

if (flag('list')) {
  for (const [k, e] of Object.entries(registry)) console.log(`${k}: ${e.description}`)
  process.exit(0)
}

const t0 = performance.now()
const report = runDecision(decision, opts)
const ms = Math.round(performance.now() - t0)

if (flag('json')) {
  console.log(JSON.stringify({ ...report, baseline: undefined, decision: undefined, comparison: undefined }, null, 2))
  process.exit(0)
}

const fmt = (v: number, unit: string) => {
  if (!Number.isFinite(v)) return 'n/a'
  if (unit === 'prob' || unit === 'pct') return `${(v * 100).toFixed(0)}%`
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toFixed(a < 10 ? 2 : 0)
}
const entry = registry[opts.model]!
console.log(`\n${report.title}  [model ${opts.model}, ${opts.runs} scenarios x ${opts.horizon} months, seed ${opts.seed}, ${ms} ms]`)
if (report.assumptions.length) {
  console.log('Assumptions stated by the author:')
  for (const a of report.assumptions) console.log(`  - ${a}`)
}
console.log('')
const header = ['metric', 'month', 'base p50', 'dec p50', 'delta p10', 'delta p50', 'delta p90', 'win rate']
const rows = report.rows.map(r => {
  const u = entry.metrics[r.metric]!.unit
  return [r.label, String(r.month), fmt(r.baseline.p50, u), fmt(r.decision.p50, u), fmt(r.delta.p10, u), fmt(r.delta.p50, u), fmt(r.delta.p90, u), `${(r.winRate * 100).toFixed(0)}%`]
})
const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)))
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ')
console.log(line(header))
console.log(widths.map(w => '-'.repeat(w)).join('  '))
for (const r of rows) console.log(line(r))
console.log('\nRead: delta is decision minus do-nothing in the same scenario; p10 is the 1-in-10 bad case, p90 the 1-in-10 good case. Win rate is the share of scenarios where the decision beats do-nothing on that metric.')
