import { mulberry32, normal } from './rng'

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })
  it('normal has mean ~0 and sd ~1', () => {
    const r = mulberry32(7)
    const n = 20000
    let s = 0
    let s2 = 0
    for (let i = 0; i < n; i++) {
      const x = normal(r)
      s += x
      s2 += x * x
    }
    const mean = s / n
    const sd = Math.sqrt(s2 / n - mean * mean)
    expect(Math.abs(mean)).toBeLessThan(0.03)
    expect(Math.abs(sd - 1)).toBeLessThan(0.03)
  })
})
