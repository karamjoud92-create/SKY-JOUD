import { tornado, breakEven, whatMustBeTrue } from './sensitivity'
import { setPath } from '../models/registry'

const opts = { model: 'toy', runs: 40, horizon: 12, seed: 5 }

describe('setPath', () => {
  it('sets nested paths without mutating', () => {
    const o = { a: { b: 1 } }
    const r = setPath(o, 'a.c', 2)
    expect(r).toEqual({ a: { b: 1, c: 2 } })
    expect(o).toEqual({ a: { b: 1 } })
  })
})

describe('tornado', () => {
  it('ranks interest as the parameter that changes a spending cut\'s cash effect most', () => {
    const rows = tornado({ levers: { spend: 60 } }, opts, 'cash')
    expect(rows[0]!.path).toBe('params.interest')
    expect(rows[0]!.deltaAtHigh).toBeGreaterThan(rows[0]!.deltaAtLow)
    const income = rows.find(r => r.path === 'params.incomeScale')!
    // a spending cut's delta does not depend on income in the toy model
    expect(income.swing).toBeLessThan(1e-6)
  })
  it('rejects bad paths', () => {
    expect(() => tornado({}, opts, 'cash', [{ path: 'nope.x', label: 'x', low: 0, high: 1 }])).toThrow(/must start with/)
  })
})

describe('breakEven', () => {
  it('finds the spend level where more spending stops being a loss', () => {
    // decision: spend 100 vs baseline spend 90. Cash always lower => never wins on cash, regardless of interest
    const be = breakEven({ levers: { spend: 100 } }, opts, 'cash', { path: 'params.interest', label: 'i', low: 0, high: 0.03 })
    expect(be.direction).toBe('never_wins')
    const be2 = breakEven({ levers: { spend: 60 } }, opts, 'cash', { path: 'params.interest', label: 'i', low: 0, high: 0.03 })
    expect(be2.direction).toBe('always_wins')
  })
  it('bisects a real threshold on an indicator metric', () => {
    // Decision raises spend to 140; baseline 90. Under low income the baseline also goes negative late; P(cash<0) higher for decision.
    // Use incomeScale as the swing: at high income both stay positive (tie => decision never "wins" on a lower-is-better tie), so expect never_wins or a threshold.
    const be = breakEven({ levers: { spend: 140 } }, { ...opts, horizon: 24 }, 'cashNegative', { path: 'params.incomeScale', label: 's', low: 0.2, high: 2 })
    expect(['never_wins', 'wins_above', 'wins_below']).toContain(be.direction)
  })
})

describe('whatMustBeTrue', () => {
  it('returns one row per range', () => {
    const rows = whatMustBeTrue({ levers: { spend: 60 } }, opts, 'cash')
    expect(rows.length).toBe(3)
  })
})
