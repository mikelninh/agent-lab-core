import assert from 'node:assert/strict';
import { RandomAgent, runMatch, verifyReplay } from '../index.mjs';
import { runEnvironmentConformance } from '../conformance.mjs';
import { buildChoiceReport } from '../reporting.mjs';
import { createRelicRaceEnvironment } from './relic-race.mjs';

const environmentFactory = () => createRelicRaceEnvironment();
const agents = {
  alpha: new RandomAgent({ name: 'alpha-random' }),
  beta: new RandomAgent({ name: 'beta-random' })
};
const match = await runMatch({ environment: environmentFactory(), agents, seed: 'public-smoke' });
await verifyReplay({ replay: match.replay, environmentFactory });
const conformance = await runEnvironmentConformance({ environmentFactory, seeds: ['a', 'b', 'c'] });
assert.equal(conformance.ok, true);
const report = buildChoiceReport([
  { outcome: 1, choices: { action: ['gather'] }, metrics: { turns: 4 } },
  { outcome: 0, choices: { action: ['study'] }, metrics: { turns: 5 } }
], { minSamples: 1 });
assert.equal(report.schema, 'agent-lab.choice-report.v1');
console.log('Agent Lab Core smoke test passed.');
