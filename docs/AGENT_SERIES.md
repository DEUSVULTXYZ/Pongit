# Bounded agent series candidate

Status: private implementation and qualification only. Human production, Agent Arcade and public tournament admissions remain closed. The previous one-match pool and its evidence are preserved. This candidate does not establish continuous capacity or a passing 24-hour trial.

## Why sessions are grouped

The real validator admission limit is shared by applications, and an exiting session occupies its place until release. Finishing one short match per session therefore spends most of the occupied time waiting for the protocol's one-hour exit window. Cleaning up demonstrably empty old deployments and playing several bounded games per session are separate optimizations. Neither raises the validator's configured limit.

Interlude external reads are pinned to the delegation's base block. Simply inserting a new Monad admission while an engine is running does not authorize that admission in its view. The series pool reserves a fixed list of independent fixtures or qualification pairs on Monad before opening. The engine cannot append a player or accept a privileged operator signature to replace this authority.

## Contracts and identity

`SeriesAgentArena` is rules 11. It reuses the corrected Classic/Chaos physics and 24 effects, with the existing five-minute agent limit and at most one minute of knockout overtime. Every game keeps a distinct network, arena, epoch and ID. Historical bindings, results, nonces and effect state are not overwritten by the next game.

`AgentSeriesPool` reserves participants through the common catalogue and tournament contracts. It captures each published result independently. Known fixtures can be grouped; an unresolved knockout dependency stops the group. Controller versions stay fixed, and learned controller memory follows the actual tournament, including consecutive fixtures inside a session. Qualification pairs remain friendly and require published valid-controller evidence. A cancellation never qualifies a strategy.

The initial private candidate has two arenas and a 120,000-engine-block admission window. It reserves 36,000 blocks for a whole subsequent match and binds at most three fixtures at once. This is an admission bound, not a proven upper bound on publication cost. If insufficient margin remains, subsequent games are canceled explicitly, at most one per command. All terminal outcomes must be published and captured before normal closure. Expiry recovery preserves already completed games and cancels unfinished or unstarted ones after verified release.

The runtime is about 29 KB. Monad's documented 128 KiB limit permits this base-chain size; the deployment helper applies a stricter explicit 32 KiB budget only to this candidate. Hosted Interlude execution is a separate mandatory check. All transactions remain below Monad's 30 M gas limit. [Monad differences](https://docs.monad.xyz/developer-essentials/differences), [Interlude security model](https://github.com/Veenoway/interlude-sdk/blob/main/docs/04-security.md).

## Recovery and services

The optional series transport retains one serialized nonce owner per arena and epoch. Operations include the game ID. `advanceSeries(expectedId)` and `drainSeries(expectedId)` reject a stale transition even if another participant has advanced the engine. A lost response is reconciled from its exact signed transaction. An old game's receipt resolves that transaction only and does not become the new game's snapshot. A reorganized hub read cannot retire a pending command.

Private scripts are `deploy-agent-series.ts`, `agent-series-step.ts` and `agent-series-engines.ts`. Deployment does not open a session or award qualification. The keeper uses the existing operator journal and lock; it cannot enable public capacity. The engine waits for each current result's Monad capture before starting the next authorized game. A slow randomness fetch remains independent of ticks. All writers run as UID 1000.

Compact observations record actual revealed effects and reset signals, without frames, commands or private payloads. Per-observer counters make retried writes idempotent and preserve cumulative signals across process restarts. Coalescing a reset with a newer snapshot does not erase the reset evidence. Seven-day retention is enforced at service initialization. These observations are diagnostics, not a source of official results or a standalone availability measurement.

## Qualification still required

- Real multi-match execution and publication on hosted Interlude, including both modes, event proofs and maximum-duration/overtime releases.
- Actual reduction in occupied delegations and total costs, with bounded batches and enough verified spare capacity.
- Human challenge lane, family/session integration, versioned readers, UI, sponsor, indexing and historical repair end-to-end. The private series candidate is not a replacement for these routes yet.
- Complete tournaments, correction and restart tests, followed by a new unchanged 24-hour trial and browser checks.

The disposable hub tests are not evidence of hosted admission capacity. The 100-command synthetic human trial on the earlier pool is not physical Mera authentication evidence and does not qualify this new arena. Public switches stay closed until all applicable delivery gates pass.

## Hosted checkpoint, 19 September 2026

Candidate `8a9d26b` was deployed privately. Pool `0xd1cc910fea9b3b705cef6982281701d3c7d5aaa8` owns the rules-11 arenas `0xd7c72a69c01b9ca62f10ba05a2614cd1af3e0eeb` and `0xbe12acef62ca94de2c711678f314f2daf5159d73`. Public admissions remain disabled.

The first arena opened epoch 1 at transaction `0xea217761af97134b9e80922cff29ea469b05e08bed31fe12dbdc848d1a588ad6`, block 64000780. Its first five-minute Classic qualification completed and was captured at `0xa21a94a0becebb9adb059a4aa96d1d59c960aa046c7c7cfe4107faa1351f9281`. The engine then started match 2 in the same epoch while preserving match 1. This proves a real consecutive-match transition; it does not yet prove end-of-series release, rotation capacity, Chaos series, or continuous availability.

`scripts/agent-series-evidence.ts` collects paced, block-pinned public state and compares per-match publications with their captures. It checks arena bytecode and complete references, excludes deployment keys, and reports pending capture separately from a result mismatch. Reports remain explicitly partial until the other gates pass.
