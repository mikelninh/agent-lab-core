#!/usr/bin/env python3
"""Standalone Python game engine for Agent Lab's JSONL protocol."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from typing import Any

PROTOCOL = "agent-lab.jsonl.v1"
PLAYERS = ["alpha", "beta"]
ROUNDS = 5


class TreasureDuel:
    def __init__(self) -> None:
        self.state: dict[str, Any] | None = None

    def reset(self, seed: str) -> None:
        digest = hashlib.sha256(f"treasure-duel:{seed}".encode()).digest()
        self.state = {
            "schema": "treasure-duel.environment.v1",
            "seed": str(seed),
            "round": 0,
            "turnIndex": 0,
            "weather": [digest[index] % 3 for index in range(ROUNDS)],
            "players": {
                player: {"carried": 0, "vault": 0, "intel": 0, "actions": []}
                for player in PLAYERS
            },
            "terminal": False,
            "result": None,
        }

    def _require(self) -> dict[str, Any]:
        if self.state is None:
            raise RuntimeError("Environment must be reset before use")
        return self.state

    def currentPlayer(self) -> str | None:
        state = self._require()
        return None if state["terminal"] else PLAYERS[state["turnIndex"]]

    def observe(self, player_id: str) -> dict[str, Any]:
        state = self._require()
        opponent = next(player for player in PLAYERS if player != player_id)
        return {
            "schema": state["schema"],
            "seed": state["seed"],
            "round": state["round"],
            "rounds": ROUNDS,
            "weather": state["weather"][state["round"]] if not state["terminal"] else None,
            "playerId": player_id,
            "self": copy.deepcopy(state["players"][player_id]),
            "opponent": {
                "vault": state["players"][opponent]["vault"],
                "intel": state["players"][opponent]["intel"],
                "actionCount": len(state["players"][opponent]["actions"]),
            },
        }

    def legalActions(self, player_id: str) -> list[dict[str, Any]]:
        state = self._require()
        if state["terminal"] or player_id != self.currentPlayer():
            return []
        player = state["players"][player_id]
        actions = [
            {"type": "search", "features": {"safety": 0.4, "power": 1.0, "novelty": 0.2}},
            {"type": "scout", "features": {"safety": 1.0, "synergy": 0.8, "novelty": 1.1}},
        ]
        if player["carried"] > 0:
            actions.append({"type": "bank", "features": {"safety": 1.8, "power": 0.6}})
            actions.append({"type": "steal", "features": {"aggression": 1.8, "power": 0.8, "safety": -0.3}})
        return actions

    def step(self, player_id: str, action: dict[str, Any]) -> dict[str, Any]:
        state = self._require()
        if player_id != self.currentPlayer():
            raise ValueError(f"Wrong player: expected {self.currentPlayer()}, got {player_id}")
        action_type = action.get("type")
        if action_type not in {entry["type"] for entry in self.legalActions(player_id)}:
            raise ValueError(f"Illegal action: {action_type}")
        player = state["players"][player_id]
        opponent_id = next(player for player in PLAYERS if player != player_id)
        opponent = state["players"][opponent_id]
        weather = state["weather"][state["round"]]
        if action_type == "search":
            player["carried"] += 2 + (1 if weather == 0 else 0)
        elif action_type == "scout":
            player["intel"] += 1
            player["carried"] += 2 if weather == 2 else 1
        elif action_type == "bank":
            player["vault"] += player["carried"]
            player["carried"] = 0
        elif action_type == "steal":
            player["carried"] -= 1
            stolen = min(2 if weather == 1 else 1, opponent["vault"])
            opponent["vault"] -= stolen
            player["vault"] += stolen
        player["actions"].append(action_type)
        if state["turnIndex"] == len(PLAYERS) - 1:
            state["turnIndex"] = 0
            state["round"] += 1
            if state["round"] >= ROUNDS:
                self._finish()
        else:
            state["turnIndex"] += 1
        return {"accepted": True, "round": state["round"], "terminal": state["terminal"]}

    def _finish(self) -> None:
        state = self._require()
        scores = {
            player: data["vault"] + data["carried"] + data["intel"] * 2
            for player, data in state["players"].items()
        }
        draw = scores[PLAYERS[0]] == scores[PLAYERS[1]]
        winner = None if draw else max(PLAYERS, key=lambda player: scores[player])
        placements = {player: 1 for player in PLAYERS} if draw else {
            winner: 1,
            next(player for player in PLAYERS if player != winner): 2,
        }
        state["terminal"] = True
        state["result"] = {
            "schema": "treasure-duel.result.v1",
            "seed": state["seed"],
            "draw": draw,
            "winner": winner,
            "scores": scores,
            "placements": placements,
            "players": copy.deepcopy(state["players"]),
        }

    def isTerminal(self) -> bool:
        return bool(self._require()["terminal"])

    def result(self) -> dict[str, Any]:
        state = self._require()
        if not state["terminal"]:
            raise RuntimeError("Result requested before terminal state")
        return copy.deepcopy(state["result"])

    def snapshot(self) -> dict[str, Any]:
        return copy.deepcopy(self._require())


def respond(request_id: int, *, result: Any = None, error: Exception | None = None) -> None:
    payload: dict[str, Any] = {"protocol": PROTOCOL, "id": request_id, "ok": error is None}
    if error is None:
        payload["result"] = result
    else:
        payload["error"] = {"code": error.__class__.__name__, "message": str(error), "details": {}}
    print(json.dumps(payload, separators=(",", ":")), flush=True)


def main() -> None:
    environment = TreasureDuel()
    for line in sys.stdin:
        if not line.strip():
            continue
        request: dict[str, Any] | None = None
        try:
            request = json.loads(line)
            if request.get("protocol") != PROTOCOL:
                raise ValueError(f"Expected protocol {PROTOCOL}")
            request_id = int(request["id"])
            method = request["method"]
            params = request.get("params", {})
            if method == "close":
                respond(request_id)
                return
            if method == "reset":
                result = environment.reset(params["seed"])
            elif method in {"currentPlayer", "isTerminal", "result", "snapshot"}:
                result = getattr(environment, method)()
            elif method in {"observe", "legalActions"}:
                result = getattr(environment, method)(params["playerId"])
            elif method == "step":
                result = environment.step(params["playerId"], params["action"])
            else:
                raise ValueError(f"Unknown method {method}")
            respond(request_id, result=result)
        except Exception as error:  # Protocol boundary: return structured errors.
            respond(int(request.get("id", -1)) if request else -1, error=error)


if __name__ == "__main__":
    main()
