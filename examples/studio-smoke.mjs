import assert from 'node:assert/strict';
import { assessHumanExperience, assessMechanicsEvidence, buildStudioReleaseGate } from '../studio.mjs';

const mechanics = assessMechanicsEvidence({
  conformance: { ok: true },
  matches: 500,
  illegalActions: 0,
  replayFailures: 0,
  criticalRegressions: 0,
  dominantStrategyRate: 0.58
});

const beforeHumans = buildStudioReleaseGate({
  mechanics,
  human: assessHumanExperience()
});
assert.equal(beforeHumans.status, 'review');

const afterHumans = buildStudioReleaseGate({
  mechanics,
  human: assessHumanExperience({
    sessions: 10,
    enjoyment: [4,4,4,5,5,4,4,5,4,5],
    clarity: [4,4,5,4,4,4,5,4,4,5],
    replayIntentRate: 0.7
  })
});
assert.equal(afterHumans.status, 'pass');

console.log(JSON.stringify({ beforeHumans, afterHumans }, null, 2));
