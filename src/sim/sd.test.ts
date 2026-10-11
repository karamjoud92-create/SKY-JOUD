import { smooth, stermanOrders, ShipmentPipeline, DelayN } from './sd'

describe('smooth', () => {
  it('moves 1-exp(-1) of the gap per time constant and converges', () => {
    let x = 0
    x = smooth(x, 10, 1)
    expect(x).toBeCloseTo(10 * (1 - Math.exp(-1)), 9)
    for (let i = 0; i < 50; i++) x = smooth(x, 10, 1)
    expect(x).toBeCloseTo(10, 6)
  })
  it('zero time constant tracks input exactly', () => {
    expect(smooth(3, 7, 0)).toBe(7)
  })
})

describe('stermanOrders', () => {
  it('orders expected loss at equilibrium', () => {
    const o = stermanOrders({ expectedLoss: 100, stock: 150, supplyLine: 200, desiredCoverage: 1.5, expectedLag: 2, sat: 1, slat: 1 })
    expect(o).toBeCloseTo(100, 9)
  })
  it('never goes negative', () => {
    const o = stermanOrders({ expectedLoss: 10, stock: 10000, supplyLine: 0, desiredCoverage: 1, expectedLag: 1, sat: 1, slat: 1 })
    expect(o).toBe(0)
  })
  it('ignoring the supply line (slat = Infinity) orders more while shipments are in transit', () => {
    const base = { expectedLoss: 100, stock: 50, supplyLine: 320, desiredCoverage: 1.5, expectedLag: 2, sat: 1 }
    const disciplined = stermanOrders({ ...base, slat: 1 })
    const naive = stermanOrders({ ...base, slat: Infinity })
    expect(naive).toBeGreaterThan(disciplined)
  })
})

describe('ShipmentPipeline', () => {
  it('delivers whole lead times exactly', () => {
    const p = new ShipmentPipeline()
    p.place(1, 100, 5000, 2)
    expect(p.receive(2).units).toBe(0)
    expect(p.supplyLine).toBe(100)
    const r = p.receive(3)
    expect(r.units).toBe(100)
    expect(r.cost).toBe(5000)
    expect(p.supplyLine).toBe(0)
  })
  it('splits fractional lead times so the mean delay is exact', () => {
    const p = new ShipmentPipeline()
    p.place(1, 100, 1000, 1.25)
    const a = p.receive(2)
    const b = p.receive(3)
    expect(a.units).toBeCloseTo(75, 9)
    expect(b.units).toBeCloseTo(25, 9)
    expect(a.cost + b.cost).toBeCloseTo(1000, 9)
  })
  it('delayAll pushes every shipment back', () => {
    const p = new ShipmentPipeline()
    p.place(1, 10, 10, 1)
    p.delayAll(2)
    expect(p.receive(2).units).toBe(0)
    expect(p.receive(4).units).toBe(10)
  })
  it('snapshot/from round-trips state for immutable step functions', () => {
    const p = new ShipmentPipeline()
    p.place(1, 10, 10, 1)
    const q = ShipmentPipeline.from(p.snapshot())
    expect(q.receive(2).units).toBe(10)
    expect(p.supplyLine).toBe(10)
  })
})

describe('DelayN', () => {
  it('conserves material: total out equals total in over a long run', () => {
    const d = new DelayN(3)
    let totalOut = 0
    for (let m = 0; m < 60; m++) totalOut += d.step(m < 5 ? 100 : 0, 2)
    expect(totalOut + d.content).toBeCloseTo(500, 6)
    expect(d.content).toBeLessThan(0.01)
  })
  it('mean residence time equals tau for a pulse', () => {
    const d = new DelayN(3)
    let weighted = 0
    let total = 0
    for (let m = 0; m < 80; m++) {
      const out = d.step(m === 0 ? 100 : 0, 2.5, 8)
      weighted += out * (m + 0.5)
      total += out
    }
    expect(total).toBeCloseTo(100, 3)
    // the pulse enters spread over month 0, mean entry time 0.5
    expect(weighted / total - 0.5).toBeCloseTo(2.5, 1)
  })
})

/**
 * Beer Game fixture (docs/01-research.md section 4, validation protocol):
 * four echelons (0 retailer .. 3 factory), 2-week order delay and 2-week
 * shipping delay at each link, demand step 4 -> 8 at week 5. Ordering that
 * underweights the supply line must amplify orders upstream (bullwhip), and
 * the disciplined policy (full supply-line weight) must amplify less.
 */
function beerGame(wsl: number, weeks = 60): { peak: number[]; totalShipped: number } {
  const n = 4
  const inv = new Array(n).fill(12)
  const backlog = new Array(n).fill(0)
  const expected = new Array(n).fill(4)
  const goods = Array.from({ length: n }, () => new ShipmentPipeline()) // goods in transit TO echelon i
  const mail = Array.from({ length: n }, () => new ShipmentPipeline()) // orders in transit FROM echelon i to i+1
  for (let i = 0; i < n; i++) {
    goods[i]!.place(-1, 4, 0, 2)
    goods[i]!.place(0, 4, 0, 2)
    mail[i]!.place(-1, 4, 0, 2)
    mail[i]!.place(0, 4, 0, 2)
  }
  const peak = new Array(n).fill(0)
  const sat = 1
  const slat = sat / wsl
  let totalShipped = 0
  for (let w = 1; w <= weeks; w++) {
    for (let i = 0; i < n; i++) {
      inv[i] += goods[i]!.receive(w).units
      const demandIn = i === 0 ? (w >= 5 ? 8 : 4) : mail[i - 1]!.receive(w).units
      const want = demandIn + backlog[i]
      const ship = Math.min(inv[i], want)
      inv[i] -= ship
      backlog[i] = want - ship
      if (i === 0) totalShipped += ship
      else goods[i - 1]!.place(w, ship, 0, 2)
      expected[i] = smooth(expected[i], demandIn, 2)
      const o = stermanOrders({
        expectedLoss: expected[i],
        stock: inv[i] - backlog[i],
        supplyLine: goods[i]!.supplyLine + mail[i]!.supplyLine,
        desiredCoverage: 3,
        expectedLag: 4,
        sat,
        slat,
      })
      if (o > peak[i]) peak[i] = o
      if (i < n - 1) mail[i]!.place(w, o, 0, 2)
      else goods[i]!.place(w, o, 0, 2) // factory production lead
    }
  }
  return { peak, totalShipped }
}

describe('Beer Game structural test', () => {
  it('goods actually flow: retailer ships most of cumulative demand within the horizon', () => {
    const { totalShipped } = beerGame(1.0)
    const demand = 4 * 4 + 8 * 56
    expect(totalShipped).toBeGreaterThan(demand * 0.8)
  })
  it('naive ordering amplifies orders upstream; disciplined ordering amplifies less', () => {
    const naive = beerGame(0.3).peak
    const disciplined = beerGame(1.0).peak
    expect(naive[3]!).toBeGreaterThan(naive[0]!)
    expect(naive[3]!).toBeGreaterThan(8)
    expect(disciplined[3]!).toBeLessThan(naive[3]!)
  })
})
