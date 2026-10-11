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
      scenario.ts            Syrian macro scenario sampler (FX, costs, energy, customs, shocks)
      sd.ts                  system-dynamics blocks: smoothing, order policy, pipelines, delays
      run.ts                 runDecision(): decision vs do-nothing on identical scenarios
    src/models/              registered business models (registry.ts)
    src/cli/sim.ts           command-line runner (what Claude Code calls)
    src/ui/                  browser app (React, Arabic and English)

## Run

    npm install
    npm test                                   # unit tests, one per feedback loop
    npm run dev                                # browser app
    npm run sim -- --list                      # registered models
    npm run sim -- --decision my-decision.json --model toy --runs 500 --horizon 36
    npm run sim -- --decision my-decision.json --json   # machine-readable

A decision file:

    {
      "title": "Extend credit to wholesalers to 45 days",
      "levers": { "creditDaysWholesale": 45 },
      "from": 1,
      "schedule": [{ "from": 7, "levers": { "creditDaysWholesale": 30 } }],
      "params": {},
      "assumptions": ["Wholesalers accept the terms without a price concession"]
    }

Lever names belong to the model (see docs/02-model-spec.md once it exists).

## Status

Pre-calibration. Parameters are documented estimates until the business
supplies monthly history. See docs/01-research.md section "Gaps".
