import { AgentLabError } from '../index.mjs';

/**
 * Minimal in-process environment template.
 * Replace the TODO sections with your game rules, then run conformance before adding agents.
 */
export function createEnvironmentTemplate({ playerIds = ['alpha', 'beta'] } = {}) {
  let state;

  const fail = (code, message, details = {}) => {
    throw new AgentLabError(code, message, details);
  };

  return {
    reset(seed) {
      state = {
        schema: 'your-game.environment.v1',
        seed: String(seed),
        currentPlayer: playerIds[0],
        turn: 0,
        terminal: false,
        players: Object.fromEntries(playerIds.map(playerId => [playerId, { score: 0 }])),
        result: null
      };
    },

    currentPlayer() {
      return state.terminal ? null : state.currentPlayer;
    },

    observe(playerId) {
      return {
        schema: state.schema,
        seed: state.seed,
        playerId,
        turn: state.turn,
        self: structuredClone(state.players[playerId])
      };
    },

    legalActions(playerId) {
      if (state.terminal || playerId !== state.currentPlayer) return [];
      return [
        { type: 'advance', amount: 1, features: { safety: 0.5, power: 0.5 } },
        { type: 'advance', amount: 2, features: { safety: 0.1, power: 1 } }
      ];
    },

    step(playerId, action) {
      if (state.terminal) fail('TERMINAL_STEP', 'Cannot step a completed game');
      if (playerId !== state.currentPlayer) fail('WRONG_PLAYER', 'Action submitted for the wrong player');
      const legal = this.legalActions(playerId);
      if (!legal.some(candidate => candidate.type === action.type && candidate.amount === action.amount)) {
        fail('ILLEGAL_ACTION', 'Action is not legal', { playerId, action });
      }
      state.players[playerId].score += action.amount;
      state.turn++;
      if (state.turn >= 6) {
        const ordered = [...playerIds].sort((left, right) => state.players[right].score - state.players[left].score);
        const draw = state.players[ordered[0]].score === state.players[ordered[1]].score;
        state.terminal = true;
        state.result = {
          schema: 'your-game.result.v1',
          draw,
          winner: draw ? null : ordered[0],
          placements: draw ? Object.fromEntries(playerIds.map(id => [id, 1])) : { [ordered[0]]: 1, [ordered[1]]: 2 },
          scores: Object.fromEntries(playerIds.map(id => [id, state.players[id].score]))
        };
      } else state.currentPlayer = playerIds[state.turn % playerIds.length];
      return { accepted: true, turn: state.turn, terminal: state.terminal };
    },

    isTerminal() {
      return state.terminal;
    },

    result() {
      if (!state.terminal) fail('RESULT_BEFORE_TERMINAL', 'Result requested before game completion');
      return structuredClone(state.result);
    },

    snapshot() {
      return structuredClone(state);
    }
  };
}
