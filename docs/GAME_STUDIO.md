# Game Studio Intelligence Layer

Agent Lab Core is becoming the shared testing nervous system for the studio.

The goal is **not** to replace designers or players. It is to let machines do the repetitive work machines are good at, so humans spend more time on the parts only humans can judge.

## Studio loop

```text
design / patch
    ↓
environment conformance
    ↓
hundreds or thousands of deterministic synthetic sessions
    ↓
replay + illegal-action + exploit + strategy + counterfactual evidence
    ↓
MECHANICS GATE
    ↓
targeted human playtest
    ↓
enjoyment + clarity + replay intent + qualitative notes
    ↓
HUMAN EXPERIENCE GATE
    ↓
release / revise
```

## What synthetic players can prove well

- deterministic rules still work;
- actions remain legal;
- replays reproduce;
- a patch changed win/choice distributions;
- one strategy appears suspiciously dominant;
- an edge case loops or crashes;
- a controlled choice produces a measurable counterfactual difference.

## What they cannot prove

- that a game is fun;
- that a character is lovable;
- that a joke lands;
- that tension feels fair;
- that a player understands the intended fantasy;
- that someone wants to come back tomorrow.

Those remain human evidence.

## Release contract

`studio.mjs` exposes three pieces:

- `assessMechanicsEvidence()`
- `assessHumanExperience()`
- `buildStudioReleaseGate()`

A release cannot receive final `pass` without both mechanics and human evidence passing.

This gives Tiny Tactics, Tiến Lên, THE THREAD, Dice Atelier, Chess Command and future games one shared quality language.

## Near-term integration order

1. **Tiny Tactics** — richest fit with existing persona and counterfactual machinery.
2. **Tiến Lên** — strong deterministic rules + culturally meaningful social play.
3. **THE THREAD** — draft/balance simulation after the minimal card set exists.
4. **Dice Atelier** — physics/interaction regression uses a different adapter but can share release evidence shape.
5. **HANA game experiences** — only after character/story canon is durable enough to survive simulation/generation at scale.

## Commercial possibility

The same layer can become a B2B **Game QA / Balance Box**:

> Give us a deterministic local game adapter. We run reproducible synthetic sessions, surface broken rules, regressions and suspicious balance shifts, and hand designers representative replays before the next human playtest.

The existing integration pilot remains the right validation wedge. Synthetic evidence is engineering evidence, not proof of market retention.
