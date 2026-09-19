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
