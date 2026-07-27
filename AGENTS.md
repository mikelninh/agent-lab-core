# Agent Lab Core — Agent Guide

Agent Lab Core is game-independent infrastructure for deterministic synthetic-player experiments. It helps developers test correctness, reproducibility, exploits and controlled patch differences without pretending synthetic agents are equivalent to human players.

## Who this repository serves

- small game teams integrating a local environment;
- developers debugging rules, simulations and replay behaviour;
- players indirectly affected by balance or quality decisions informed by the reports;
- researchers and open-source contributors evaluating reproducible agent behaviour;
- external engines communicating through the JSONL protocol;
- AI coding and gameplay agents that need strict interfaces, legal actions and verifiable outcomes.

Synthetic players are instruments, not representative humans. They do not independently establish enjoyment, comprehension, fairness perception, attachment, retention or social value.

## North star

Make game-agent experiments deterministic, inspectable, engine-neutral and honest about what they can and cannot prove.

## Core invariants

1. Identical environment, agents and seed must produce an exactly verifiable replay.
2. Only actions returned by `legalActions(playerId)` may be executed.
3. Environment conformance failures must be explicit and actionable.
4. The versioned JSONL protocol remains engine-neutral and backwards-conscious.
5. Reports must distinguish observations, statistical estimates and unsupported interpretation.
6. Core code contains no proprietary game rules, credentials, personal player data or production access.
7. Avoid runtime dependencies unless their value clearly exceeds the portability and supply-chain cost.
8. Match the existing small-module, dependency-light JavaScript style.

## Repository orientation

- `index.mjs` — public runner and agent exports.
- `conformance.mjs` — environment contract checks.
- `jsonl-protocol.mjs` — versioned external-engine protocol.
- `counterfactual.mjs` — paired controlled experiments.
- `reporting.mjs` — generic reports and confidence intervals.
- `examples/` — executable fixtures and cross-language integrations.
- `docs/INTEGRATION_PILOT.md` — pilot boundaries and onboarding.
- `SECURITY.md` and `CONTRIBUTING.md` — public contribution and disclosure guidance.

## Environment contract

An adapter implements `reset`, `currentPlayer`, `observe`, `legalActions`, `step`, `isTerminal`, `result` and `snapshot`. Preserve sync-or-promise compatibility unless an approved protocol change explicitly says otherwise.

## Working boundaries

Agents may independently add tests, fixtures, documentation, diagnostics and backwards-compatible bug fixes.

Require maintainer review before:

- changing public exports, replay format or protocol semantics;
- weakening determinism, legal-action enforcement or verification;
- adding dependencies, network access, telemetry or hosted services;
- introducing claims about real human behaviour or commercial outcomes;
- accepting credentials, personal data or proprietary game source into fixtures.

Breaking protocol or API changes need an explicit versioning and migration plan.

## Verification

```bash
npm test
```

For behavioural changes, add the smallest deterministic fixture that fails before the fix and passes after it. Check both successful execution and malformed or illegal inputs where relevant.

## Definition of done

A change is ready for review when tests pass; determinism and replay verification remain intact; public interfaces and compatibility effects are documented; evidence claims stay within the synthetic-player boundary; and the diff is understandable to game developers, human reviewers and future agents.
