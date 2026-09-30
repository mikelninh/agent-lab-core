import { AgentLabError } from './index.mjs';

function fail(code, message, details = {}) {
  throw new AgentLabError(code, message, details);
}

function boundedRate(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    fail('INVALID_RATE', `${field} must be between 0 and 1`, { field, value });
  }
  return number;
}

function mean(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

export function assessMechanicsEvidence({
  conformance,
  matches = 0,
  illegalActions = 0,
  replayFailures = 0,
  criticalRegressions = 0,
  dominantStrategyRate = 0,
  thresholds = {}
} = {}) {
  const limits = {
    minMatches: thresholds.minMatches ?? 200,
    maxIllegalActions: thresholds.maxIllegalActions ?? 0,
    maxReplayFailures: thresholds.maxReplayFailures ?? 0,
    maxCriticalRegressions: thresholds.maxCriticalRegressions ?? 0,
    maxDominantStrategyRate: thresholds.maxDominantStrategyRate ?? 0.65
  };
  if (!Number.isInteger(matches) || matches < 0) fail('INVALID_MATCHES', 'matches must be a non-negative integer');
  for (const [name, value] of Object.entries({ illegalActions, replayFailures, criticalRegressions })) {
    if (!Number.isInteger(value) || value < 0) fail('INVALID_COUNT', `${name} must be a non-negative integer`, { name, value });
  }
  const dominance = boundedRate(dominantStrategyRate, 'dominantStrategyRate');

  const blockers = [];
  const review = [];
  if (conformance?.ok !== true) blockers.push('environment_conformance_failed');
  if (illegalActions > limits.maxIllegalActions) blockers.push('illegal_actions_detected');
  if (replayFailures > limits.maxReplayFailures) blockers.push('replay_failures_detected');
  if (criticalRegressions > limits.maxCriticalRegressions) blockers.push('critical_regression_detected');
  if (matches < limits.minMatches) review.push('insufficient_simulation_sample');
  if (dominance > limits.maxDominantStrategyRate) review.push('possible_dominant_strategy');

  return {
    status: blockers.length ? 'block' : review.length ? 'review' : 'pass',
    evidenceLabel: 'synthetic-mechanics',
    limits,
    metrics: {
      matches,
      illegalActions,
      replayFailures,
      criticalRegressions,
      dominantStrategyRate: dominance
    },
    blockers,
    review
  };
}

export function assessHumanExperience({
  sessions = 0,
  enjoyment = [],
  clarity = [],
  replayIntentRate = null,
  thresholds = {}
} = {}) {
  const limits = {
    minSessions: thresholds.minSessions ?? 10,
    minEnjoyment: thresholds.minEnjoyment ?? 4,
    minClarity: thresholds.minClarity ?? 4,
    minReplayIntentRate: thresholds.minReplayIntentRate ?? 0.6
  };
  if (!Number.isInteger(sessions) || sessions < 0) fail('INVALID_SESSIONS', 'sessions must be a non-negative integer');
  if (!Array.isArray(enjoyment) || !Array.isArray(clarity)) fail('INVALID_HUMAN_EVIDENCE', 'enjoyment and clarity must be arrays');

  const enjoymentMean = mean(enjoyment);
  const clarityMean = mean(clarity);
  const replayIntent = replayIntentRate === null ? null : boundedRate(replayIntentRate, 'replayIntentRate');

  if (sessions === 0) {
    return {
      status: 'unproven',
      evidenceLabel: 'human-experience',
      limits,
      metrics: { sessions, enjoymentMean, clarityMean, replayIntentRate: replayIntent },
      reasons: ['no_human_playtest_evidence']
    };
  }

  const review = [];
  if (sessions < limits.minSessions) review.push('insufficient_human_sessions');
  if (enjoymentMean === null || enjoymentMean < limits.minEnjoyment) review.push('enjoyment_below_target');
  if (clarityMean === null || clarityMean < limits.minClarity) review.push('clarity_below_target');
  if (replayIntent === null || replayIntent < limits.minReplayIntentRate) review.push('replay_intent_below_target');

  return {
    status: review.length ? 'review' : 'pass',
    evidenceLabel: 'human-experience',
    limits,
    metrics: { sessions, enjoymentMean, clarityMean, replayIntentRate: replayIntent },
    reasons: review
  };
}

export function buildStudioReleaseGate({ mechanics, human } = {}) {
  if (!mechanics || !human) fail('MISSING_EVIDENCE', 'mechanics and human evidence are required');
  const reasons = [];
  let status = 'pass';

  if (mechanics.status === 'block') {
    status = 'block';
    reasons.push(...mechanics.blockers);
  } else if (mechanics.status !== 'pass') {
    status = 'review';
    reasons.push(...mechanics.review);
  }

  if (human.status !== 'pass') {
    if (status !== 'block') status = 'review';
    reasons.push(...(human.reasons || ['human_experience_unproven']));
  }

  return {
    schema: 'agent-lab.studio-release-gate.v1',
    status,
    mechanics,
    human,
    reasons: [...new Set(reasons)],
    principle: 'Simulation can gate mechanics; only humans can validate enjoyment, clarity, attachment and meaning.'
  };
}
