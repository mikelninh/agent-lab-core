# Agent Lab Core Gauntlet Optimizer

Use Agent Lab Core as a reproducible experiment substrate.

1. Freeze environment version, seed set and evaluation metrics.
2. Run the baseline population and verify every replay.
3. Inspect exploit misses, low-signal comparisons or strategy collapse.
4. State one falsifiable hypothesis.
5. Mutate one policy/experiment surface only.
6. Rerun the exact same seeds plus held-out seeds.
7. Any illegal action, replay mismatch or determinism failure => `REVERT`.
8. Otherwise `KEEP` only if exploit discovery / counterfactual signal improves without unacceptable strategy collapse.
9. Report confidence intervals and compute cost.
10. Commit experiment metadata.

Synthetic players may support correctness, exploit discovery and controlled balance comparisons. Never promote a synthetic score into a claim about human fun, attachment, fairness perception or retention.
