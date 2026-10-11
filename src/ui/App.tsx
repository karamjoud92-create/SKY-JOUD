import { useMemo, useState } from 'react'
import { FanChart, defaultFormat } from './FanChart'
import { t, dir, type Lang } from './i18n'
import { runDecision, type RunReport } from '../sim/run'
import { registry, type DecisionFile } from '../models/registry'

const EXAMPLE: DecisionFile = {
  title: 'Spend less',
  levers: { spend: 60 },
  assumptions: ['Example on the smoke-test model; the Sky Joud model replaces it.'],
}

function fmtUnit(unit: string): (v: number) => string {
  if (unit === 'prob' || unit === 'pct') return v => `${(v * 100).toFixed(0)}%`
  return defaultFormat
}

export function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [modelName, setModelName] = useState<string>(Object.keys(registry)[0] ?? 'toy')
  const [runs, setRuns] = useState(300)
  const [horizon, setHorizon] = useState(36)
  const [seed, setSeed] = useState(1)
  const [decisionText, setDecisionText] = useState(JSON.stringify(EXAMPLE, null, 2))
  const [report, setReport] = useState<RunReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  document.documentElement.dir = dir(lang)
  document.documentElement.lang = lang

  const entry = registry[modelName]!
  const run = () => {
    try {
      const decision = JSON.parse(decisionText) as DecisionFile
      const t0 = performance.now()
      const r = runDecision(decision, { model: modelName, runs, horizon, seed })
      setElapsed(Math.round(performance.now() - t0))
      setReport(r)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const headline = useMemo(() => Object.entries(entry.metrics).filter(([, m]) => m.headline !== false), [entry])
  const lastMonth = report ? report.options.horizon : horizon

  return (
    <div className="container">
      <header>
        <div>
          <h1>{t(lang, 'title')}</h1>
          <p className="sub">{t(lang, 'subtitle')}</p>
        </div>
        <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t(lang, 'language')}</button>
      </header>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>{t(lang, 'decision')}</h2>
          <textarea
            value={decisionText}
            onChange={e => setDecisionText(e.target.value)}
            rows={12}
            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13, background: 'var(--bg)', color: 'var(--fg)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, direction: 'ltr' }}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <label className="field">model<select value={modelName} onChange={e => setModelName(e.target.value)}>{Object.keys(registry).map(k => <option key={k} value={k}>{k}</option>)}</select></label>
            <label className="field">{t(lang, 'runs')}<input type="number" value={runs} min={10} max={5000} onChange={e => setRuns(Number(e.target.value))} /></label>
            <label className="field">{t(lang, 'horizon')}<input type="number" value={horizon} min={6} max={60} onChange={e => setHorizon(Number(e.target.value))} /></label>
            <label className="field">seed<input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))} /></label>
            <button className="primary" onClick={run}>{t(lang, 'run')}</button>
          </div>
          {error && <p className="bad small">{error}</p>}
          {elapsed !== null && <p className="muted small">{elapsed} ms</p>}
        </div>
        <div className="card">
          <h2>{t(lang, 'results')}</h2>
          {!report && <p className="muted">{entry.description}</p>}
          {report && (
            <table>
              <thead>
                <tr><th>{t(lang, 'month')} {lastMonth}</th><th>{t(lang, 'baseline')}</th><th>{t(lang, 'decision')}</th><th>{t(lang, 'delta')}</th><th>{t(lang, 'winRate')}</th></tr>
              </thead>
              <tbody>
                {report.rows.filter(r => r.month === lastMonth).map(r => {
                  const f = fmtUnit(entry.metrics[r.metric]!.unit)
                  const good = entry.metrics[r.metric]!.higherIsBetter ? r.delta.p50 > 0 : r.delta.p50 < 0
                  const tie = r.delta.p10 === 0 && r.delta.p90 === 0
                  return (
                    <tr key={r.metric}>
                      <td>{r.label}</td>
                      <td>{f(r.baseline.p50)}</td>
                      <td>{f(r.decision.p50)}</td>
                      <td className={tie ? 'muted' : good ? 'good' : 'bad'}>{f(r.delta.p10)} / {f(r.delta.p50)} / {f(r.delta.p90)}</td>
                      <td>{tie ? '=' : `${(r.winRate * 100).toFixed(0)}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {report && report.assumptions.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h2>{t(lang, 'assumptions')}</h2>
              <ul className="small">{report.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      {report && (
        <div className="grid">
          {headline.map(([k, m]) => (
            <FanChart key={`d-${k}`} summary={report.decision[k]!} title={`${m.label} (${t(lang, 'decision')})`} monthLabel={t(lang, 'month')} format={fmtUnit(m.unit)} zeroLine={m.unit === 'money'} />
          ))}
          {headline.map(([k, m]) => (
            <FanChart key={`x-${k}`} summary={report.comparison.delta[k]!} title={`${m.label}: ${t(lang, 'delta')}`} monthLabel={t(lang, 'month')} format={fmtUnit(m.unit)} zeroLine />
          ))}
        </div>
      )}
    </div>
  )
}
