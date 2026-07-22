# Agent Lab Core Integration Pilot

## Goal

Help 3–5 small game teams connect one discrete-action game, run reproducible synthetic matches, and receive a report that changes or confirms a real development decision.

## Good pilot games

- card and deck-building games;
- turn-based tactics;
- auto-battlers;
- board and strategy games;
- roguelike decision layers;
- puzzle or economy simulations.

Real-time action games can participate when they expose a discrete simulation or decision interface. Frame-perfect visual control is outside the v0.1 pilot.

## What the team provides

- a local executable or process adapter implementing `agent-lab.jsonl.v1`;
- stable player IDs;
- JSON-safe observations, legal actions, snapshots, and results;
- deterministic reset behaviour for a supplied seed;
- a small scenario bank suitable for automated runs.

Do not provide source code, credentials, production access, personal player data, or proprietary assets unless your own organisation has explicitly approved that disclosure. A black-box local process is sufficient.

## Pilot sequence

### 1. Conformance

Run the environment against `runEnvironmentConformance` until deterministic reset, legal actions, bounded termination, and replay verification pass.

### 2. Baseline

Run at least 100 mirrored matches with random or simple persona agents. Confirm that every finding links back to an exact seed and replay.

### 3. Development question

Choose one concrete question, such as:

- Does a card or unit dominate across policies?
- Did a patch create a first-player advantage?
- Can a strategy exploit an action-order edge?
- Does a defensive option ever produce a viable path?

### 4. Controlled comparison

When possible, hold the seed and all non-controlled decisions constant. Use a paired counterfactual rather than interpreting a broad association as causality.

### 5. Decision review

Record what changed in the team’s decision:

- changed a design or balance value;
- added a regression test;
- rejected a suspected problem;
- discovered an integration or rules bug;
- found the report inconclusive and identified the missing evidence.

## Success criteria

The pilot succeeds when:

- initial conformance takes less than one working day;
- the adapter requires no modification to Agent Lab Core;
- at least 95% of attempted matches terminate and replay exactly;
- every material finding includes a deterministic reproduction;
- one report influences a real development decision;
- the team can explain the result without maintainer interpretation;
- no secrets, personal data, or production access enter the workflow.

## Feedback requested

Please report:

- engine and language;
- integration time;
- confusing contract or error messages;
- missing metrics;
- the development question tested;
- whether the report changed a decision;
- what would make the workflow worth paying for as a hosted service.

## Commercial boundary

The permissive core remains local and open source. Potential paid layers include hosted compute, scheduled comparisons, dashboards, replay retention, team permissions, private adapter support, and enterprise integrations.
