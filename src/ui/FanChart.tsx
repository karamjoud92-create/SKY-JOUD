import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import type { MetricSummary } from '../sim/engine'

export interface FanChartProps {
  summary: MetricSummary
  title: string
  monthLabel: string
  format?: (v: number) => string
  zeroLine?: boolean
  height?: number
}

/** p10 to p90 band, p25 to p75 inner band, p50 line. */
export function FanChart({ summary, title, monthLabel, format = defaultFormat, zeroLine = false, height = 220 }: FanChartProps) {
  const data = summary.p50.map((_, i) => ({
    month: i + 1,
    outer: [summary.p10[i] as number, summary.p90[i] as number],
    inner: [summary.p25[i] as number, summary.p75[i] as number],
    p50: summary.p50[i] as number,
  }))
  return (
    <div className="card">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} label={{ value: monthLabel, position: 'insideBottomRight', offset: -2, fill: 'var(--muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={format} width={64} />
          <Tooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--fg)' }}
            formatter={(v: unknown, name: unknown) => {
              if (Array.isArray(v)) return [`${format(v[0] as number)} to ${format(v[1] as number)}`, name === 'outer' ? 'p10 to p90' : 'p25 to p75']
              return [format(v as number), 'p50']
            }}
            labelFormatter={(m: unknown) => `${monthLabel} ${String(m)}`}
          />
          {zeroLine && <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 4" />}
          <Area type="monotone" dataKey="outer" stroke="none" fill="var(--accent-softer)" isAnimationActive={false} />
          <Area type="monotone" dataKey="inner" stroke="none" fill="var(--accent-soft)" isAnimationActive={false} />
          <Line type="monotone" dataKey="p50" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function defaultFormat(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}k`
  return v.toFixed(a < 10 ? 2 : 0)
}
