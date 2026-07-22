import { AgentLabError, RandomAgent, hashValue, runMatch, stableStringify, verifyReplay } from './index.mjs';

function fail(code, message, details = {}) {
  throw new AgentLabError(code, message, details);
}

async function closeEnvironment(environment) {
  if (typeof environment?.close === 'function') await environment.close();
}

export async function runEnvironmentConformance({
  environmentFactory,
  playerIds = ['alpha', 'beta'],
  seeds = Array.from({ length: 12 }, (_, index) => `conformance-${index}`),
  maxSteps = 500
} = {}) {
  if (typeof environmentFactory !== 'function') fail('INVALID_FACTORY', 'environmentFactory must be a function');
  if (!Array.isArray(playerIds) || playerIds.length < 2) fail('INVALID_PLAYERS', 'At least two player ids are required');
  const deterministicResets = [];
  const resultHashes = new Set();
  let totalSteps = 0;

  for (const seed of seeds) {
    const firstEnvironment = environmentFactory();
    const secondEnvironment = environmentFactory();
    try {
      await firstEnvironment.reset(seed);
      await secondEnvironment.reset(seed);
      const firstSnapshot = await firstEnvironment.snapshot();
      const secondSnapshot = await secondEnvironment.snapshot();
      stableStringify(firstSnapshot);
      stableStringify(secondSnapshot);
      const firstHash = hashValue(firstSnapshot);
      const secondHash = hashValue(secondSnapshot);
      if (firstHash !== secondHash) fail('NON_DETERMINISTIC_RESET', `Environment reset differs for seed ${seed}`, { seed, firstHash, secondHash });
      deterministicResets.push(firstHash);
    } finally {
      await closeEnvironment(firstEnvironment);
      await closeEnvironment(secondEnvironment);
    }

    const agents = Object.fromEntries(playerIds.map(playerId => [playerId, new RandomAgent({ name: `conformance-${playerId}` })]));
    const matchEnvironment = environmentFactory();
    try {
      const match = await runMatch({ environment: matchEnvironment, agents, seed, maxSteps });
      if (!match.metrics.steps) fail('EMPTY_MATCH', `Environment made no progress for seed ${seed}`, { seed });
      stableStringify(match.finalState);
      stableStringify(match.result);
      await verifyReplay({ replay: match.replay, environmentFactory, maxSteps });
      totalSteps += match.metrics.steps;
      resultHashes.add(match.replay.resultHash);
    } finally {
      await closeEnvironment(matchEnvironment);
    }
  }

  return {
    schema: 'agent-lab.conformance.v1',
    ok: true,
    seeds: seeds.length,
    players: [...playerIds],
    deterministicResets: new Set(deterministicResets).size,
    distinctResults: resultHashes.size,
    totalSteps,
    averageSteps: totalSteps / seeds.length,
    checks: [
      'deterministic-reset',
      'json-safe-state',
      'legal-action-enforcement',
      'bounded-termination',
      'fresh-environment-replay',
      'async-adapter-support'
    ]
  };
}
