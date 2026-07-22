export class AgentLabError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgentLabError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new AgentLabError(code, message, details);
}

export function stableStringify(value) {
  const seen = new WeakSet();
  const visit = (input, path) => {
    if (input === null || typeof input === 'boolean' || typeof input === 'string') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) fail('NON_FINITE_NUMBER', `Non-finite number at ${path}`, { path, value: input });
      return input;
    }
    if (typeof input === 'undefined' || typeof input === 'function' || typeof input === 'symbol' || typeof input === 'bigint') {
      fail('NOT_JSON_SAFE', `Unsupported value at ${path}`, { path, type: typeof input });
    }
    if (seen.has(input)) fail('CYCLIC_VALUE', `Cyclic value at ${path}`, { path });
    seen.add(input);
    let output;
    if (Array.isArray(input)) {
      output = input.map((entry, index) => visit(entry, `${path}[${index}]`));
    } else {
      output = {};
      for (const key of Object.keys(input).sort()) output[key] = visit(input[key], `${path}.${key}`);
    }
    seen.delete(input);
    return output;
  };
  return JSON.stringify(visit(value, '$'));
}

export function hashValue(value) {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createRng(seedInput) {
  let state = Number.parseInt(hashValue(String(seedInput)), 16) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.int = (min, max) => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) fail('INVALID_RANGE', 'rng.int requires an integer min <= max', { min, max });
    return min + Math.floor(random() * (max - min + 1));
  };
  random.pick = array => {
    if (!Array.isArray(array) || array.length === 0) fail('EMPTY_PICK', 'rng.pick requires a non-empty array');
    return array[random.int(0, array.length - 1)];
  };
  random.shuffle = array => {
    const copy = [...array];
    for (let index = copy.length - 1; index > 0; index--) {
      const swapIndex = random.int(0, index);
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };
  random.state = () => state >>> 0;
  return random;
}

function assertMethod(target, name, label) {
  if (!target || typeof target[name] !== 'function') fail('INVALID_CONTRACT', `${label} must implement ${name}()`, { method: name });
}

export function assertEnvironment(environment) {
  for (const method of ['reset', 'currentPlayer', 'observe', 'legalActions', 'step', 'isTerminal', 'result', 'snapshot']) {
    assertMethod(environment, method, 'Environment');
  }
}

export function assertAgent(agent, playerId) {
  assertMethod(agent, 'chooseAction', `Agent ${playerId}`);
}

function actionKey(action) {
  return stableStringify(action);
}

function containsAction(legalActions, action) {
  const key = actionKey(action);
  return legalActions.some(candidate => actionKey(candidate) === key);
}

export class RandomAgent {
  constructor({ name = 'random' } = {}) {
    this.name = name;
  }

  chooseAction({ legalActions, rng }) {
    return rng.pick(legalActions);
  }
}

export const PERSONA_PROFILES = Object.freeze({
  'formation-first': Object.freeze({ safety: 1.6, synergy: 1.1, power: 0.7, aggression: 0.2, novelty: -0.2, mistakeRate: 0.03 }),
  'synergy-hunter': Object.freeze({ safety: 0.3, synergy: 1.8, power: 0.8, aggression: 0.4, novelty: 0.1, mistakeRate: 0.04 }),
  'glass-cannon': Object.freeze({ safety: -0.4, synergy: 0.4, power: 1.1, aggression: 1.8, novelty: 0.2, mistakeRate: 0.06 }),
  turtle: Object.freeze({ safety: 2, synergy: 0.5, power: 0.4, aggression: -0.7, novelty: -0.4, mistakeRate: 0.02 }),
  chaos: Object.freeze({ safety: 0.1, synergy: 0.1, power: 0.1, aggression: 0.1, novelty: 1.8, mistakeRate: 0.28 })
});

export class WeightedPersonaAgent {
  constructor({ name = 'persona', profile = PERSONA_PROFILES['formation-first'] } = {}) {
    this.name = name;
    this.profile = { ...profile };
  }

  chooseAction({ legalActions, rng }) {
    if (legalActions.length === 1) return legalActions[0];
    if (rng() < (this.profile.mistakeRate ?? 0)) return rng.pick(legalActions);
    const scored = legalActions.map(action => {
      const features = action.features ?? {};
      let score = 0;
      for (const [feature, weight] of Object.entries(this.profile)) {
        if (feature === 'mistakeRate') continue;
        score += (Number(features[feature]) || 0) * Number(weight || 0);
      }
      score += rng() * 0.000001;
      return { action, score };
    });
    scored.sort((left, right) => right.score - left.score);
    return scored[0].action;
  }
}

export async function runMatch({ environment, agents, seed, maxSteps = 500 }) {
  assertEnvironment(environment);
  if (!agents || typeof agents !== 'object') fail('INVALID_AGENTS', 'agents must be an object keyed by player id');
  for (const [playerId, agent] of Object.entries(agents)) assertAgent(agent, playerId);

  await environment.reset(seed);
  const initialState = await environment.snapshot();
  stableStringify(initialState);
  const replay = {
    schema: 'agent-lab.replay.v1',
    seed: String(seed),
    players: Object.keys(agents),
    initialStateHash: hashValue(initialState),
    steps: [],
    result: null,
    resultHash: null
  };
  const metrics = { steps: 0, actionsByPlayer: {}, actionTypes: {} };

  while (!(await environment.isTerminal())) {
    if (metrics.steps >= maxSteps) fail('STEP_LIMIT', `Match exceeded ${maxSteps} steps`, { seed, maxSteps });
    const playerId = await environment.currentPlayer();
    if (!playerId || !agents[playerId]) fail('UNKNOWN_PLAYER', 'Environment requested a player without an agent', { playerId, players: Object.keys(agents) });
    const observation = await environment.observe(playerId);
    const legalActions = await environment.legalActions(playerId);
    stableStringify(observation);
    stableStringify(legalActions);
    if (!Array.isArray(legalActions) || legalActions.length === 0) fail('NO_LEGAL_ACTIONS', 'Non-terminal state has no legal actions', { playerId, step: metrics.steps });

    const rng = createRng(`${seed}:${playerId}:${metrics.steps}:${agents[playerId].name ?? 'agent'}`);
    const selected = await agents[playerId].chooseAction({ playerId, observation, legalActions, rng, step: metrics.steps });
    if (!containsAction(legalActions, selected)) {
      fail('ILLEGAL_ACTION', `Agent ${playerId} selected an illegal action`, { playerId, selected, legalActions });
    }

    const outcome = await environment.step(playerId, selected);
    const state = await environment.snapshot();
    stableStringify(outcome ?? null);
    stableStringify(state);
    replay.steps.push({
      index: metrics.steps,
      playerId,
      observationHash: hashValue(observation),
      legalActionHashes: legalActions.map(hashValue),
      action: selected,
      actionHash: hashValue(selected),
      outcome: outcome ?? null,
      stateHash: hashValue(state)
    });
    metrics.steps++;
    metrics.actionsByPlayer[playerId] = (metrics.actionsByPlayer[playerId] || 0) + 1;
    const type = selected.type ?? 'unknown';
    metrics.actionTypes[type] = (metrics.actionTypes[type] || 0) + 1;
  }

  const result = await environment.result();
  const finalState = await environment.snapshot();
  stableStringify(result);
  replay.result = result;
  replay.resultHash = hashValue(result);
  return { result, replay, metrics, finalState };
}

export async function verifyReplay({ replay, environmentFactory, maxSteps = 500 }) {
  if (!replay || replay.schema !== 'agent-lab.replay.v1') fail('INVALID_REPLAY', 'Unsupported replay schema');
  if (typeof environmentFactory !== 'function') fail('INVALID_FACTORY', 'environmentFactory must be a function');
  const environment = environmentFactory();
  assertEnvironment(environment);
  try {
    await environment.reset(replay.seed);
    const initialState = await environment.snapshot();
    if (hashValue(initialState) !== replay.initialStateHash) {
      fail('REPLAY_INITIAL_STATE_MISMATCH', 'Replay initial state does not match', { expected: replay.initialStateHash, actual: hashValue(initialState) });
    }
    if (replay.steps.length > maxSteps) fail('REPLAY_STEP_LIMIT', 'Replay exceeds verification step limit', { steps: replay.steps.length, maxSteps });

    for (const recorded of replay.steps) {
      if (await environment.isTerminal()) fail('REPLAY_ENDED_EARLY', 'Environment ended before replay steps were consumed', { step: recorded.index });
      const playerId = await environment.currentPlayer();
      if (playerId !== recorded.playerId) fail('REPLAY_PLAYER_MISMATCH', 'Replay current player differs', { step: recorded.index, expected: recorded.playerId, actual: playerId });
      const observation = await environment.observe(playerId);
      if (hashValue(observation) !== recorded.observationHash) fail('REPLAY_OBSERVATION_MISMATCH', 'Replay observation differs', { step: recorded.index });
      const legalActions = await environment.legalActions(playerId);
      if (!containsAction(legalActions, recorded.action)) fail('REPLAY_ACTION_NO_LONGER_LEGAL', 'Recorded action is no longer legal', { step: recorded.index, action: recorded.action });
      await environment.step(playerId, recorded.action);
      const stateHash = hashValue(await environment.snapshot());
      if (stateHash !== recorded.stateHash) fail('REPLAY_STATE_MISMATCH', 'Replay state differs after action', { step: recorded.index, expected: recorded.stateHash, actual: stateHash });
    }

    if (!(await environment.isTerminal())) fail('REPLAY_NOT_TERMINAL', 'Replay steps ended before the environment');
    const result = await environment.result();
    if (hashValue(result) !== replay.resultHash) fail('REPLAY_RESULT_MISMATCH', 'Replay result differs', { expected: replay.resultHash, actual: hashValue(result) });
    return { ok: true, result };
  } finally {
    if (typeof environment.close === 'function') await environment.close();
  }
}

export async function runTournament({ environmentFactory, agentFactories, seeds, maxSteps = 500 }) {
  if (typeof environmentFactory !== 'function') fail('INVALID_FACTORY', 'environmentFactory must be a function');
  const playerIds = Object.keys(agentFactories ?? {});
  if (playerIds.length < 2) fail('NOT_ENOUGH_PLAYERS', 'Tournament needs at least two player agents');
  const summary = {
    matches: 0,
    wins: Object.fromEntries(playerIds.map(playerId => [playerId, 0])),
    placements: Object.fromEntries(playerIds.map(playerId => [playerId, {}])),
    draws: 0,
    totalSteps: 0,
    actionTypes: {},
    resultHashes: {}
  };

  for (const seed of seeds) {
    const agents = Object.fromEntries(playerIds.map(playerId => [playerId, agentFactories[playerId]() ]));
    const environment = environmentFactory();
    try {
      const match = await runMatch({ environment, agents, seed, maxSteps });
      summary.matches++;
      summary.totalSteps += match.metrics.steps;
      for (const [type, count] of Object.entries(match.metrics.actionTypes)) summary.actionTypes[type] = (summary.actionTypes[type] || 0) + count;
      const placements = match.result.placements ?? {};
      const first = Object.entries(placements).filter(([, placement]) => placement === 1).map(([playerId]) => playerId);
      if (first.length === 1 && Object.hasOwn(summary.wins, first[0])) summary.wins[first[0]]++;
      else summary.draws++;
      for (const playerId of playerIds) {
        const placement = String(placements[playerId] ?? 'unknown');
        summary.placements[playerId][placement] = (summary.placements[playerId][placement] || 0) + 1;
      }
      summary.resultHashes[match.replay.resultHash] = (summary.resultHashes[match.replay.resultHash] || 0) + 1;
    } finally {
      if (typeof environment.close === 'function') await environment.close();
    }
  }
  summary.averageSteps = summary.matches ? summary.totalSteps / summary.matches : 0;
  return summary;
}
