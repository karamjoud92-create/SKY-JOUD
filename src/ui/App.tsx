import { useMemo, useState } from 'react'
import { FanChart } from './FanChart'
import { t, dir, type Lang } from './i18n'
import { monteCarlo, type SimModel, type ScenarioSampler } from '../sim/engine'

/* Placeholder toy model so the shell renders end to end. Replaced by the Sky Joud model. */
interface S { cash: number }
interface P { start: number }
interface L { spend: number }
interface X { income: number }
const toy: SimModel<S, P, L, X> = {
  init: p => ({ cash: p.start }),
  step: (s, _p, l, x) => ({ cash: s.cash + x.income - l.spend }),
  metrics: s => ({ cash: s.cash }),
}
const sampler: ScenarioSampler<X> = {
  sample: (rand, h) => Array.from({ length: h }, () => ({ income: 100 + Math.floor(rand() * 60) })),
}

export function App() {
  const [lang, setLang] = useState<Lang>('en')
  const [runs, setRuns] = useState(300)
  const [horizon, setHorizon] = useState(24)
  document.documentElement.dir = dir(lang)
  document.documentElement.lang = lang

  const result = useMemo(() => monteCarlo(toy, { start: 500 }, { spend: 125 }, sampler, { runs, horizon, seed: 1 }), [runs, horizon])

  return (
    <div className="container">
      <header>
        <div>
          <h1>{t(lang, 'title')}</h1>
          <p className="sub">{t(lang, 'subtitle')}</p>
        </div>
        <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t(lang, 'language')}</button>
      </header>
      <div className="row" style={{ marginBottom: 16 }}>
        <label className="field">{t(lang, 'runs')}<input type="number" value={runs} min={10} max={5000} onChange={e => setRuns(Number(e.target.value))} /></label>
        <label className="field">{t(lang, 'horizon')}<input type="number" value={horizon} min={6} max={60} onChange={e => setHorizon(Number(e.target.value))} /></label>
      </div>
      <div className="grid">
        <FanChart summary={result.summary.cash!} title="Cash (toy model)" monthLabel={t(lang, 'month')} zeroLine />
      </div>
    </div>
  )
}
