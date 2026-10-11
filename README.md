# Sky Joud Simulator

Decision stress-test tool for Sky Joud, a food and beverage import, manufacturing
and distribution company in Damascus. You describe a decision; the simulator
turns it into lever settings on a stock-and-flow model of the business, runs it
forward 12 to 36 months under hundreds of macro scenarios, and reports the
range of outcomes and the feedback loops that produced them.

It is a thinking tool, not an oracle. Same question gives the same answer, every
assumption is visible, and output is ranges, never a single number.

## Layout

    docs/00-concept.md       why and what, non-goals, build phases
    docs/01-research.md      sourced facts on the Syrian operating environment
    docs/02-model-spec.md    stocks, flows, levers, scenarios, loops, equations
    src/sim/                 pure TypeScript simulation core (no DOM)
      rng.ts                 seeded PRNG
      engine.ts              runner, Monte Carlo, quantiles, paired comparison
    src/cli/                 command-line runner (what Claude Code calls)
    src/ui/                  browser app (React, Arabic and English)

## Run

    npm install
    npm test            # unit tests, one per feedback loop
    npm run dev         # browser app
    npm run sim -- ...  # CLI, see src/cli/sim.ts

## Status

Pre-calibration. Parameters are documented estimates until the business
supplies monthly history. See docs/01-research.md section "Gaps".
