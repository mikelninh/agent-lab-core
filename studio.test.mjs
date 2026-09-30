import test from 'node:test';
import assert from 'node:assert/strict';

import { assessHumanExperience, assessMechanicsEvidence, buildStudioReleaseGate } from './studio.mjs';

const goodMechanics = () => assessMechanicsEvidence({
  conformance: { ok: true },
  matches: 1000,
  illegalActions: 0,
  replayFailures: 0,
  criticalRegressions: 0,
  dominantStrategyRate: 0.54
});

test('excellent simulation cannot pass final release without human playtests', () => {
  const mechanics = goodMechanics();
  const human = assessHumanExperience();
  const gate = buildStudioReleaseGate({ mechanics, human });

  assert.equal(mechanics.status, 'pass');
  assert.equal(human.status, 'unproven');
  assert.equal(gate.status, 'review');
  assert.ok(gate.reasons.includes('no_human_playtest_evidence'));
});

test('mechanics regressions block even with strong human scores', () => {
  const mechanics = assessMechanicsEvidence({
    conformance: { ok: true },
    matches: 1000,
    illegalActions: 0,
    replayFailures: 1,
    criticalRegressions: 0,
    dominantStrategyRate: 0.5
  });
  const human = assessHumanExperience({
    sessions: 12,
    enjoyment: Array(12).fill(4.5),
    clarity: Array(12).fill(4.4),
    replayIntentRate: 0.75
  });
  const gate = buildStudioReleaseGate({ mechanics, human });

  assert.equal(mechanics.status, 'block');
  assert.equal(human.status, 'pass');
  assert.equal(gate.status, 'block');
});

test('release passes only when mechanics and human evidence both pass', () => {
  const mechanics = goodMechanics();
  const human = assessHumanExperience({
    sessions: 12,
    enjoyment: [4,4,5,5,4,4,5,4,5,4,4,5],
    clarity: [4,4,4,5,4,5,4,4,5,4,5,4],
    replayIntentRate: 0.75
  });
  const gate = buildStudioReleaseGate({ mechanics, human });

  assert.equal(mechanics.status, 'pass');
  assert.equal(human.status, 'pass');
  assert.equal(gate.status, 'pass');
});

test('dominant strategy signal triggers review rather than false certainty', () => {
  const mechanics = assessMechanicsEvidence({
    conformance: { ok: true },
    matches: 1000,
    illegalActions: 0,
    replayFailures: 0,
    criticalRegressions: 0,
    dominantStrategyRate: 0.81
  });
  assert.equal(mechanics.status, 'review');
  assert.ok(mechanics.review.includes('possible_dominant_strategy'));
});
