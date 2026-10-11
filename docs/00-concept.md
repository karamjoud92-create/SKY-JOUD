# SKY JOUD SIMULATOR — Concept (v0, pre-discovery)

Status: draft written before any business facts were collected. Everything
below is a proposal to be corrected once the discovery questions in section 7
are answered. Do not treat the model skeleton as a description of Sky Joud.

## 1. What this is, and what it is not

**Is:** a decision-stress-test tool. A user states a decision in plain
language ("extend credit terms to 60 days for the top 20 retailers"), the tool
turns it into lever settings on a calibrated model of the business, runs the
model forward 12–36 months under many macro scenarios, and reports the
distribution of outcomes (cash, margin, service level, risk of stockout or
insolvency) plus the feedback loops that drove them. Claude's job is to
translate, interrogate and explain. The model's job is to compute.

**Is not:**
- A "replica" or digital twin of every SKU, truck and invoice. That is a
  multi-year enterprise project and would be wrong anyway because the inputs
  (Syrian FX, fuel, customs, electricity) move faster than any twin can track.
- An oracle. If the answer comes from a language model reasoning in a prompt,
  two people asking the same question get two different answers, and the tool
  launders opinion as analysis. Same question must give the same answer, and
  every assumption behind it must be visible and editable.
- A forecast. Output is ranges and dominant causal paths, never a single
  number.

## 2. Why system dynamics, not a spreadsheet

The user's stated goal is to think like a strategic supply-chain systems
thinker. The failure mode that discipline exists to fix is: decisions whose
first-order effect is good and whose second-order effect, arriving 3–9 months
later through a feedback loop, is bad. Example chain that kills distributors:

    longer credit terms -> sales up -> receivables up -> cash down
    -> purchase orders cut -> stockouts -> sales down AND customers churn
    -> fixed costs now spread over less volume -> margin collapses

A spreadsheet shows month 1. A stock-and-flow model with explicit lags shows
month 9. That is the whole point of the tool.

## 3. Architecture

    +------------------------------------------------------------------+
    |  UI (web, Arabic/English)                                         |
    |  - "Ask a decision" box      - Turn-by-turn mode (the game feel)  |
    |  - Scenario picker           - Dashboards: cash, margin, service  |
    +------------------------------------------------------------------+
    |  Claude layer (interpreter, not oracle)                           |
    |  - NL decision -> structured lever changes (JSON)                 |
    |  - Explains results, names the loop that drove them               |
    |  - Devil's advocate: "you did not set X, the model assumed Y"     |
    +------------------------------------------------------------------+
    |  Simulation core (deterministic, pure functions, unit-tested)     |
    |  - Stocks & flows, monthly step                                   |
    |  - Levers (decisions)   - Scenario inputs (macro)                 |
    |  - Monte Carlo runner over scenario distributions                 |
    +------------------------------------------------------------------+
    |  Calibration data                                                  |
    |  - Monthly P&L, inventory days, DSO/DPO, lead times, FX history    |
    |  - Versioned parameter sets; every run records which set it used  |
    +------------------------------------------------------------------+

Language: TypeScript end to end (model runs in the browser, no server needed
for v1; same code can run in Node for batch runs). Python is the alternative
if the team already lives in pandas; decide in discovery.

## 4. Model skeleton (generic distributor, to be replaced by Sky Joud's reality)

Stocks (state carried month to month):
- Cash (SYP and USD held separately; FX exposure is a first-class stock)
- Inventory by product family (units and landed cost)
- Receivables, aged buckets (0–30, 31–60, 61–90, 90+)
- Payables, aged
- Active customer count by segment
- Supplier relationship strength (affects allocation and terms in shortages)
- Capacity: warehouse, fleet, headcount
- Reputation / service level history (drives churn with a lag)

Flows:
- Demand -> orders -> fill (limited by inventory) -> sales -> receivables
- Purchase orders (policy-driven) -> lead time -> arrivals -> inventory
- Collections (aging-driven, with bad-debt rate rising with age)
- Payments to suppliers, payroll, rent, fuel, electricity, customs
- Hiring/attrition, capex

Decision levers (what a user can change):
- Price / discount by segment
- Credit terms by segment, and credit limit policy
- Inventory policy: reorder point, safety stock, order quantity per family
- Supplier mix and payment terms; forward-buying when FX is expected to move
- New product family / new region entry (fixed cost + demand ramp curve)
- Capex: warehouse, trucks
- Headcount
- Currency holding policy (what share of cash sits in USD)

Scenario inputs (what the user cannot change, sampled per run):
- SYP/USD path (drift + volatility + jump probability)
- Inflation of operating costs
- Fuel and electricity price and availability
- Customs/border delay distribution (extends lead time, adds cost)
- Demand shock (sector-specific, with persistence)
- Competitor entry / price war probability
- Policy events (tariff change, import ban on a family, sanctions status)

Feedback loops to model explicitly (each gets a test):
- Credit -> cash -> purchasing -> service level -> churn (above)
- Stockout -> lost sale -> reputation -> demand (lagged)
- FX move -> landed cost -> price decision -> volume -> fixed-cost leverage
- Forward-buying -> inventory days -> cash lock -> can't exploit next FX move
- Headcount growth -> fixed cost -> break-even point -> fragility to shocks

## 5. Output of a run

For a decision D compared against "do nothing":
- Distribution (p10 / p50 / p90) at 6, 12, 24, 36 months of: cash, net margin,
  revenue, inventory days, service level, probability of cash < 0
- The three loops that explain most of the difference, in words
- The assumptions the model filled in that the user did not state
- A "what would have to be true" list: parameter values under which D wins
  vs loses, so the argument moves from opinion to checkable facts

## 6. Build phases

1. Discovery (section 7) and data collection. No code before this is done.
2. Core model in TypeScript with unit tests on each feedback loop, calibrated
   to real monthly history. Acceptance: backtest reproduces last 12 months
   of P&L within an agreed tolerance when fed actual decisions and actual
   macro.
3. Scenario engine + Monte Carlo. Acceptance: 1000 runs under 2 seconds in a
   browser.
4. Claude layer: decision parsing, explanation, devil's advocate.
5. UI: single-page web app, Arabic/English, turn-by-turn mode for team
   workshops, batch mode for individual analysis.
6. Pilot with 3 real decisions the business is actually facing; compare the
   tool's "what would have to be true" lists with what the team believed.

## 7. Open discovery questions (blocking)

1. What is Sky Joud: what it sells, to whom, where, how it buys, and rough
   scale (revenue order of magnitude, headcount, product families, customer
   count, supplier count). Distributor, manufacturer, logistics, or mix?
2. The SYRIA GAME / REBUILD SYRIA reference: not in this repo, not in Drive,
   and not in this session's memory. Need the rules, the turn structure, and
   what worked, as a paste or a file.
3. Data: do real monthly numbers exist (P&L, inventory, sales by family,
   lead times, DSO, FX used)? Which system holds them? If none, the tool
   starts as an assumption model and the first deliverable is a data plan.
4. The 5–10 decisions actually on the table in the next 12 months. The tool
   is only as good as the levers it models.
5. Users and surface: just the owner in Claude Code, or a web app the team
   opens? Arabic, English, both?
6. Hosting constraints: local-only, or can it live on the open web behind a
   login?
