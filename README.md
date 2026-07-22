# Agent Lab Core

Deterministic synthetic-player infrastructure for turn-based and discrete-action games.

Agent Lab Core supplies the game-independent pieces:

- seeded match execution;
- strict legal-action enforcement;
- exact replay recording and verification;
- deterministic environment conformance tests;
- weighted persona and random baseline agents;
- paired counterfactual experiments;
- engine-neutral JSON Lines process adapters;
- generic choice-association reports with confidence intervals.

It does **not** contain a game, proprietary rules, hosted compute, or claims about human fun and retention.

## Requirements

- Node.js 20 or newer
- no runtime dependencies

## Environment contract

An environment may implement synchronous functions or return promises:

```js
reset(seed)
currentPlayer()
observe(playerId)
legalActions(playerId)
step(playerId, action)
isTerminal()
result()
snapshot()
```

## Quick start

```js
import { RandomAgent, runMatch, verifyReplay } from '@mikelninh/agent-lab-core';
import { createRelicRaceEnvironment } from '@mikelninh/agent-lab-core/examples/relic-race';

const environmentFactory = () => createRelicRaceEnvironment();
const agents = {
  alpha: new RandomAgent({ name: 'alpha-random' }),
  beta: new RandomAgent({ name: 'beta-random' })
};

const match = await runMatch({
  environment: environmentFactory(),
  agents,
  seed: 'launch-seed'
});

await verifyReplay({ replay: match.replay, environmentFactory });
console.log(match.result);
```

## Conformance

```js
import { runEnvironmentConformance } from '@mikelninh/agent-lab-core/conformance';

const result = await runEnvironmentConformance({
  environmentFactory,
  playerIds: ['alpha', 'beta']
});
```

## External engines

The versioned `agent-lab.jsonl.v1` protocol lets Unity, Godot, Unreal, Python, C++, or another engine expose the same contract over standard input/output. See `jsonl-protocol.mjs` and `examples/relic-race-server.mjs`.

## Evidence boundary

Synthetic players are valuable for correctness, exploit discovery, reproducibility, strategy distributions, and controlled patch comparisons. They do not independently prove comprehension, enjoyment, fairness perception, attachment, retention, or social value.

## Status

This is an early public core. Protocol compatibility is versioned, but the API may still evolve before 1.0.
