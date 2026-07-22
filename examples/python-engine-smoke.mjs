import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RandomAgent, runMatch, verifyReplay } from '../index.mjs';
import { runEnvironmentConformance } from '../conformance.mjs';
import { createJsonlEnvironmentClient } from '../jsonl-protocol.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const environmentFactory = () => createJsonlEnvironmentClient({
  command: 'python3',
  args: [resolve(here, 'python-treasure-duel.py')],
  timeoutMs: 5000
});

const agents = {
  alpha: new RandomAgent({ name: 'python-alpha' }),
  beta: new RandomAgent({ name: 'python-beta' })
};
const environment = environmentFactory();
try {
  const match = await runMatch({ environment, agents, seed: 'python-public-smoke' });
  assert.equal(match.result.schema, 'treasure-duel.result.v1');
  await verifyReplay({ replay: match.replay, environmentFactory });
} finally {
  await environment.close();
}
const conformance = await runEnvironmentConformance({
  environmentFactory,
  seeds: ['python-a', 'python-b', 'python-c']
});
assert.equal(conformance.ok, true);
assert.ok(conformance.totalSteps > 0);
console.log('Python external-engine integration passed.');
