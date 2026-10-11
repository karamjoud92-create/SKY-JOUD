/**
 * System-dynamics building blocks, business-agnostic. Monthly outer step with
 * exact discrete updates for first-order structures so a 1-month step does not
 * fabricate oscillation (docs/01-research.md section 4, "Time step").
 */

/** Exact first-order exponential smoothing update over dt (default one month). */
export function smooth(prev: number, input: number, timeConstant: number, dt = 1): number {
  if (timeConstant <= 0) return input
  const alpha = 1 - Math.exp(-dt / timeConstant)
  return prev + (input - prev) * alpha
}

/**
 * Sterman's stock management structure (Business Dynamics ch. 17).
 * Orders = max(0, expectedLoss + (desiredStock - stock)/SAT + (desiredSupplyLine - supplyLine)/SLAT)
 * desiredStock = expectedLoss * desiredCoverage; desiredSupplyLine = expectedLoss * expectedLag.
 * Units: stock in units, times in months, returns units ordered this month.
 */
export interface OrderPolicyInput {
  expectedLoss: number
  stock: number
  supplyLine: number
  desiredCoverage: number
  expectedLag: number
  /** Stock adjustment time, months. */
  sat: number
  /** Supply line adjustment time, months. wsl = sat/slat; wsl = 1 is the disciplined policy. */
  slat: number
}

export function stermanOrders(i: OrderPolicyInput): number {
  const desiredStock = i.expectedLoss * i.desiredCoverage
  const desiredSupplyLine = i.expectedLoss * i.expectedLag
  const stockAdj = (desiredStock - i.stock) / Math.max(i.sat, 1e-9)
  const slAdj = i.slat === Infinity ? 0 : (desiredSupplyLine - i.supplyLine) / Math.max(i.slat, 1e-9)
  return Math.max(0, i.expectedLoss + stockAdj + slAdj)
}

/**
 * Discrete shipment pipeline: each order carries its own lead time (which may be
 * fractional, e.g. 1.6 months) and arrives in the month that lead time elapses.
 * Fractional parts arrive proportionally split across the two bounding months,
 * which keeps the mean delay exact at monthly resolution.
 */
export interface Shipment {
  units: number
  /** Total landed cost of the shipment in local currency, committed at order time. */
  cost: number
  arrivesAt: number
}

export class ShipmentPipeline {
  private queue: Shipment[] = []

  /** Place an order at `month` with `leadMonths` delay. */
  place(month: number, units: number, cost: number, leadMonths: number): void {
    if (units <= 0) return
    const lead = Math.max(0, leadMonths)
    const whole = Math.floor(lead)
    const frac = lead - whole
    if (frac < 1e-9) {
      this.queue.push({ units, cost, arrivesAt: month + whole })
    } else {
      this.queue.push({ units: units * (1 - frac), cost: cost * (1 - frac), arrivesAt: month + whole })
      this.queue.push({ units: units * frac, cost: cost * frac, arrivesAt: month + whole + 1 })
    }
  }

  /** Delay every outstanding shipment by `months` (a route closure). */
  delayAll(months: number): void {
    for (const s of this.queue) s.arrivesAt += months
  }

  /** Remove and return everything arriving at or before `month`. */
  receive(month: number): { units: number; cost: number } {
    let units = 0
    let cost = 0
    const keep: Shipment[] = []
    for (const s of this.queue) {
      if (s.arrivesAt <= month) {
        units += s.units
        cost += s.cost
      } else keep.push(s)
    }
    this.queue = keep
    return { units, cost }
  }

  /** Units still in transit. */
  get supplyLine(): number {
    return this.queue.reduce((a, s) => a + s.units, 0)
  }

  /** Cash already committed to shipments in transit. */
  get committedCost(): number {
    return this.queue.reduce((a, s) => a + s.cost, 0)
  }

  snapshot(): Shipment[] {
    return this.queue.map(s => ({ ...s }))
  }

  static from(items: Shipment[]): ShipmentPipeline {
    const p = new ShipmentPipeline()
    p.queue = items.map(s => ({ ...s }))
    return p
  }
}

/**
 * nth-order material delay (cascade of n first-order stages), integrated with
 * sub-steps so the outer monthly step respects dt < tau/3. Used for diffuse
 * delays such as customer perception or receivables collection, where a
 * discrete pipeline is not appropriate.
 */
export class DelayN {
  private stages: number[]
  constructor(public readonly order: number, initialContent = 0) {
    this.stages = new Array(order).fill(initialContent / order)
  }
  /** Push `inflow` (units per month) for one month at delay time `tau`; returns outflow this month. */
  step(inflow: number, tau: number, subSteps = 4): number {
    const dt = 1 / subSteps
    const stageTau = Math.max(tau / this.order, 1e-9)
    let out = 0
    for (let k = 0; k < subSteps; k++) {
      let input = inflow
      for (let i = 0; i < this.order; i++) {
        const outflow = (this.stages[i] as number) / stageTau
        this.stages[i] = (this.stages[i] as number) + (input - outflow) * dt
        input = outflow
      }
      out += input * dt
    }
    return out
  }
  get content(): number {
    return this.stages.reduce((a, b) => a + b, 0)
  }
}
