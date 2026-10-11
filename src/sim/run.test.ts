import { runDecision } from './run'
import { leverScheduleFor, registry, deepMerge } from '../models/registry'
import { leversAt } from './engine'

describe('deepMerge', () => {
  it('merges nested objects and replaces arrays', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, d: [1, 2] }, { a: { b: 9 }, d: [3] })).toEqual({ a: { b: 9, c: 2 }, d: [3] })
  })
})

describe('leverScheduleFor', () => {
  it('applies overrides from the given month onward', () => {
    const sched = leverScheduleFor(registry.toy!, { levers: { spend: 10 }, from: 3, schedule: [{ from: 6, levers: { spend: 20 } }] })
    expect(leversAt(sched, 1)).toEqual({ spend: 90 })
    expect(leversAt(sched, 3)).toEqual({ spend: 10 })
    expect(leversAt(sched, 7)).toEqual({ spend: 20 })
  })
})

describe('runDecision', () => {
  it('baseline vs baseline gives zero delta and rows at checkpoints', () => {
    const r = runDecision({}, { model: 'toy', runs: 30, horizon: 12, seed: 2 })
    const cash12 = r.rows.find(x => x.metric === 'cash' && x.month === 12)!
    expect(cash12.delta.p50).toBe(0)
    expect(cash12.winRate).toBe(0)
    expect(r.rows.map(x => x.month).filter((m, i, a) => a.indexOf(m) === i)).toEqual([6, 12])
  })
  it('a spending cut raises cash in every scenario', () => {
    const r = runDecision({ title: 'cut', levers: { spend: 50 } }, { model: 'toy', runs: 30, horizon: 12, seed: 2 })
    const cash12 = r.rows.find(x => x.metric === 'cash' && x.month === 12)!
    expect(cash12.delta.p10).toBeCloseTo(40 * 12, 6)
    expect(cash12.winRate).toBe(1)
  })
  it('rejects unknown models', () => {
    expect(() => runDecision({}, { model: 'nope', runs: 1, horizon: 1, seed: 1 })).toThrow(/unknown model/)
  })
})
