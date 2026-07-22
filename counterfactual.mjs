import { AgentLabError, runMatch, stableStringify } from './index.mjs';

function fail(code, message, details = {}) {
  throw new AgentLabError(code, message, details);
}

function sortedFirst(actions) {
  return [...actions].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))[0];
}

function actionMatches(action, override) {
  if (!override || action.type !== override.type) return false;
  if (override.type === 'doctrine') return action.doctrineId === override.value;
  if (override.type === 'relic') return action.relicId === override.value;
  if (override.type === 'equipment') return action.equipmentId === override.value;
  if (override.type === 'rune') return action.runeId === override.value;
  if (override.type === 'captain') return action.unitId === override.value;
  if (override.type === 'command') return `${action.commandType}:${action.lane}` === override.value;
  return false;
}

export class DeterministicControlAgent {
  constructor({ name = 'controlled-baseline', override = null } = {}) {
    this.name = name;
    this.override = override;
  }

  chooseAction({ legalActions }) {
    if (this.override && legalActions[0]?.type === this.override.type) {
      const selected = legalActions.find(action => actionMatches(action, this.override));
      if (!selected) fail('CONTROL_NOT_AVAILABLE', `Controlled choice ${this.override.type}=${this.override.value} is not legal`, { override: this.override, legalActions });
      return selected;
    }
    return sortedFirst(legalActions);
  }
}

function subjectOutcome(match, playerId) {
  return {
    value: match.result.draw ? 0.5 : match.result.winner === playerId ? 1 : 0,
    score: match.result.scores[playerId],
    turns: match.result.turns,
    resultHash: match.replay.resultHash,
    canonicalStateHash: match.result.canonicalStateHash
  };
}

function actionSequenceWithoutControl(match, subjectId, type) {
  return match.replay.steps
    .filter(step => !(step.playerId === subjectId && step.action.type === type))
    .map(step => `${step.playerId}:${stableStringify(step.action)}`);
}

async function close(environment) {
  if (typeof environment?.close === 'function') await environment.close();
}

export async function runControlledComparison({
  environmentFactory,
  seeds,
  base,
  candidate,
  playerIds = ['alpha', 'beta'],
  maxSteps = 500,
  representativeLimit = 5
} = {}) {
  if (typeof environmentFactory !== 'function') fail('INVALID_FACTORY', 'environmentFactory is required');
  if (!Array.isArray(seeds) || !seeds.length) fail('INVALID_SEEDS', 'At least one seed is required');
  if (!base?.type || !candidate?.type || base.type !== candidate.type) fail('INVALID_CONTROL', 'Base and candidate must control the same action type');
  const pairs = [];
  const representativeFlips = [];

  for (const seed of seeds) {
    for (const subjectId of playerIds) {
      const opponentId = playerIds.find(id => id !== subjectId);
      const run = async override => {
        const environment = environmentFactory();
        try {
          const agents = {
            [subjectId]: new DeterministicControlAgent({ name: 'controlled-subject', override }),
            [opponentId]: new DeterministicControlAgent({ name: 'controlled-opponent' })
          };
          return await runMatch({ environment, agents, seed, maxSteps });
        } finally {
          await close(environment);
        }
      };
      const baseMatch = await run(base);
      const candidateMatch = await run(candidate);
      const baseSequence = actionSequenceWithoutControl(baseMatch, subjectId, base.type);
      const candidateSequence = actionSequenceWithoutControl(candidateMatch, subjectId, candidate.type);
      if (stableStringify(baseSequence) !== stableStringify(candidateSequence)) {
        fail('COUNTERFACTUAL_DRIFT', 'Non-controlled decisions changed between paired matches', { seed, subjectId, base, candidate });
      }
      const baseOutcome = subjectOutcome(baseMatch, subjectId);
      const candidateOutcome = subjectOutcome(candidateMatch, subjectId);
      const pair = {
        seed: String(seed),
        subjectId,
        base: baseOutcome,
        candidate: candidateOutcome,
        winDelta: candidateOutcome.value - baseOutcome.value,
        scoreDelta: candidateOutcome.score - baseOutcome.score,
        turnDelta: candidateOutcome.turns - baseOutcome.turns
      };
      pairs.push(pair);
      if (pair.winDelta !== 0 && representativeFlips.length < representativeLimit) representativeFlips.push(pair);
    }
  }

  const trials = pairs.length;
  const baseWinEquivalent = pairs.reduce((sum, pair) => sum + pair.base.value, 0);
  const candidateWinEquivalent = pairs.reduce((sum, pair) => sum + pair.candidate.value, 0);
  const candidateOnlyWins = pairs.filter(pair => pair.candidate.value > pair.base.value).length;
  const baseOnlyWins = pairs.filter(pair => pair.base.value > pair.candidate.value).length;
  return {
    schema: 'agent-lab.counterfactual.v1',
    evidenceLabel: 'paired-synthetic-counterfactual',
    controlledAction: base.type,
    base,
    candidate,
    seeds: seeds.length,
    trials,
    mirroredSeats: true,
    baseWinRate: baseWinEquivalent / trials,
    candidateWinRate: candidateWinEquivalent / trials,
    winRateDelta: (candidateWinEquivalent - baseWinEquivalent) / trials,
    averageScoreDelta: pairs.reduce((sum, pair) => sum + pair.scoreDelta, 0) / trials,
    averageTurnDelta: pairs.reduce((sum, pair) => sum + pair.turnDelta, 0) / trials,
    candidateOnlyWins,
    baseOnlyWins,
    unchangedOutcomes: trials - candidateOnlyWins - baseOnlyWins,
    representativeFlips,
    pairs
  };
}
