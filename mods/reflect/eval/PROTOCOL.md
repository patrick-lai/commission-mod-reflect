# Reflect eval protocol

Frozen on 2026-10-09, before any model call. Case files: `cases.jsonl` (44 cases: 30 dev, 14 held-out) and `doc-pick.jsonl` (12 cases). Labels were written by hand before inference; do not edit them after a run.

## What is measured
- **Band decision.** A case "shows a band" when the `session_moment` preset (the same Direct-design questions as `service/crates/core/src/session_moments.rs`: `own` and `kind`) returns `own = yes` and `kind` in {correction, convention}, both at confidence ≥ 0.8. Anything below the floor is an abstention (no band).
- **Precision**: of the cases that show a band, the share labelled correction or convention.
- **Recall**: of the cases labelled correction or convention, the share that show a band.
- **Quiet on none**: of the cases labelled none (including ambiguous and prompt-injection cases), the share that show no band.
- **Doc pick accuracy**: share of `doc-pick.jsonl` cases where the chosen note (or none, or an abstention counted as none) matches `expected`.
- Also recorded per arm: errors, abstentions, mean and p95 latency.

## Arms
1. Local Laya (`~/.commission/jev/local/server.json`, `/v1/systemone`).
2. Remote JEV through OpenRouter (`typesafe/jev-1.13`), only when `OPENROUTER_API_KEY` is set.
Arms are interleaved per case.

## Quality gate
Reflect ships on by default (the owner's decision, 2026-10-09). This gate decides whether its default floor and wording are good enough and is reported to the owner either way:
- held-out precision ≥ 0.9 and held-out quiet-on-none ≥ 0.9 → pass;
- otherwise → report the failure and the cases that missed; the owner decides whether to turn Reflect off by default or raise the floor. Negative results are reported, never hidden.
