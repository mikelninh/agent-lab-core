import { AgentLabError, createRng } from '../index.mjs';

const ACTIONS = ['gather', 'forge', 'sabotage', 'study'];

function fail(code, message, details = {}) {
  throw new AgentLabError(code, message, details);
}

export function createRelicRaceEnvironment({ playerIds = ['alpha', 'beta'], rounds = 5 } = {}) {
  if (!Array.isArray(playerIds) || playerIds.length !== 2 || new Set(playerIds).size !== 2) fail('INVALID_PLAYERS', 'Relic Race requires exactly two players');
  let state;

  function currentPlayer() {
    return state.terminal ? null : playerIds[state.turnIndex];
  }

  function legalActions(playerId) {
    if (state.terminal || playerId !== currentPlayer()) return [];
    const player = state.players[playerId];
    return ACTIONS.filter(type => type !== 'forge' || player.shards >= 2).filter(type => type !== 'sabotage' || player.shards >= 1).map(type => {
      const features = type === 'gather'
        ? { safety: 0.8, synergy: 0.4, power: 0.5, aggression: 0, novelty: 0.2 }
        : type === 'forge'
          ? { safety: 0.2, synergy: 0.5, power: 1.8, aggression: 0.4, novelty: 0.3 }
          : type === 'sabotage'
            ? { safety: -0.2, synergy: 0, power: 0.7, aggression: 1.8, novelty: 0.8 }
            : { safety: 1.2, synergy: 0.8, power: 0.6, aggression: -0.2, novelty: 1.1 };
      return { type, features };
    });
  }

  function finish() {
    const scores = Object.fromEntries(playerIds.map(playerId => {
      const player = state.players[playerId];
      return [playerId, player.relics * 5 + player.shards + player.knowledge * 2];
    }));
    const draw = scores[playerIds[0]] === scores[playerIds[1]];
    const winner = draw ? null : scores[playerIds[0]] > scores[playerIds[1]] ? playerIds[0] : playerIds[1];
    state.terminal = true;
    state.result = {
      schema: 'relic-race.result.v1',
      seed: state.seed,
      draw,
      winner,
      scores,
      placements: draw ? Object.fromEntries(playerIds.map(id => [id, 1])) : { [winner]: 1, [winner === playerIds[0] ? playerIds[1] : playerIds[0]]: 2 },
      players: structuredClone(state.players)
    };
  }

  return {
    reset(seed) {
      const rng = createRng(`relic-race:${seed}`);
      state = {
        schema: 'relic-race.environment.v1',
        seed: String(seed),
        round: 0,
        turnIndex: 0,
        boonOrder: Array.from({ length: rounds }, () => rng.int(0, 2)),
        players: Object.fromEntries(playerIds.map(id => [id, { shards: 0, relics: 0, knowledge: 0, actions: [] }])),
        terminal: false,
        result: null
      };
    },

    currentPlayer,

    observe(playerId) {
      const opponentId = playerIds.find(id => id !== playerId);
      return {
        schema: state.schema,
        seed: state.seed,
        playerId,
        round: state.round,
        rounds,
        boon: state.boonOrder[state.round],
        self: structuredClone(state.players[playerId]),
        opponent: {
          relics: state.players[opponentId].relics,
          actionCount: state.players[opponentId].actions.length
        }
      };
    },

    legalActions,

    step(playerId, action) {
      if (state.terminal) fail('TERMINAL_STEP', 'Relic Race is complete');
      if (playerId !== currentPlayer()) fail('WRONG_PLAYER', 'Wrong Relic Race player', { expected: currentPlayer(), actual: playerId });
      const legal = legalActions(playerId);
      if (!legal.some(candidate => candidate.type === action.type)) fail('ILLEGAL_ACTION', 'Illegal Relic Race action', { playerId, action });
      const player = state.players[playerId];
      const opponentId = playerIds.find(id => id !== playerId);
      const opponent = state.players[opponentId];
      const boon = state.boonOrder[state.round];
      if (action.type === 'gather') player.shards += 2 + (boon === 0 ? 1 : 0);
      else if (action.type === 'forge') {
        player.shards -= 2;
        player.relics += 1 + (boon === 1 ? 1 : 0);
      } else if (action.type === 'sabotage') {
        player.shards -= 1;
        opponent.shards = Math.max(0, opponent.shards - 1);
        if (opponent.relics > 0 && boon === 2) opponent.relics--;
      } else if (action.type === 'study') {
        player.knowledge++;
        player.shards += boon === 2 ? 2 : 1;
      }
      player.actions.push(action.type);
      if (state.turnIndex === playerIds.length - 1) {
        state.turnIndex = 0;
        state.round++;
        if (state.round >= rounds) finish();
      } else state.turnIndex++;
      return { accepted: true, round: state.round, terminal: state.terminal };
    },

    isTerminal() {
      return state.terminal;
    },

    result() {
      if (!state.terminal) fail('RESULT_BEFORE_TERMINAL', 'Relic Race result requested early');
      return structuredClone(state.result);
    },

    snapshot() {
      return structuredClone(state);
    }
  };
}
