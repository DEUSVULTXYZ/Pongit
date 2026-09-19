# Bounded agent series candidate

Status: private implementation and qualification only. Human production, Agent Arcade and public tournament admissions remain closed. The previous one-match pool and its evidence are preserved. This candidate does not establish continuous capacity or a passing 24-hour trial.

## Why sessions are grouped

The real validator admission limit is shared by applications, and an exiting session occupies its place until release. Finishing one short match per session therefore spends most of the occupied time waiting for the protocol's one-hour exit window. Cleaning up demonstrably empty old deployments and playing several bounded games per session are separate optimizations. Neither raises the validator's configured limit.

Interlude external reads are pinned to the delegation's base block. Simply inserting a new Monad admission while an engine is running does not authorize that admission in its view. The series pool reserves a fixed list of independent fixtures or qualification pairs on Monad before opening. The engine cannot append a player or accept a privileged operator signature to replace this authority.

## Contracts and identity

`SeriesAgentArena` is rules 11. It reuses the corrected Classic/Chaos physics and 24 effects, with the existing five-minute agent limit and at most one minute of knockout overtime. Every game keeps a distinct network, arena, epoch and ID. Historical bindings, results, nonces and effect state are not overwritten by the next game.

`AgentSeriesPool` reserves participants through the common catalogue and tournament contracts. It captures each published result independently. Known tournament fixtures can be grouped; an unresolved knockout dependency stops the group. Controller versions stay fixed, and learned controller memory follows the actual tournament, including consecutive fixtures inside a session. Qualification pairs remain friendly and require published valid-controller evidence. A cancellation never qualifies a strategy.

The next candidate adds `AgentChallenges` and a two-hour `ArcadeFamily`. Its spare lane binds only one human challenge or qualification per session. A waiting playable human has priority over the next qualification; an ongoing match is never interrupted. Reserving a later qualification inside the same delegation would prevent this priority, because the engine cannot see challenges queued after its base block. Tournament fixtures retain their grouping. A revoked or expired grant prevents opening an assigned human arena and allows cancellation without consuming a delegation epoch or awarding a score. These source changes are not installed in the frozen `8a9d26b` qualification pool.

The initial private candidate has two arenas and a 120,000-engine-block admission window. It reserves 36,000 blocks for a whole subsequent match and binds at most three fixtures at once. This is an admission bound, not a proven upper bound on publication cost. If insufficient margin remains, subsequent games are canceled explicitly, at most one per command. All terminal outcomes must be published and captured before normal closure. Expiry recovery preserves already completed games and cancels unfinished or unstarted ones after verified release.

The arena and common pool runtimes are each about 29 KB. Monad's documented 128 KiB limit permits this base-chain size; the deployment helper and contract tests apply a stricter explicit 32 KiB budget to these two candidates. Other artifacts retain the 24 KiB budget. The common pool runs only on Monad and does not add its runtime to movement commands. Hosted Interlude arena execution is a separate mandatory check. All transactions remain below Monad's 30 M gas limit. [Monad differences](https://docs.monad.xyz/developer-essentials/differences), [Interlude security model](https://github.com/Veenoway/interlude-sdk/blob/main/docs/04-security.md).

## Recovery and services

The optional series transport retains one serialized nonce owner per arena and epoch. Operations include the game ID. `advanceSeries(expectedId)` and `drainSeries(expectedId)` reject a stale transition even if another participant has advanced the engine. A lost response is reconciled from its exact signed transaction. An old game's receipt resolves that transaction only and does not become the new game's snapshot. A reorganized hub read cannot retire a pending command.

Private scripts are `deploy-agent-series.ts`, `agent-series-step.ts` and `agent-series-engines.ts`. Deployment does not open a session or award qualification. The keeper uses the existing operator journal and lock; it cannot enable public capacity. The engine waits for each current result's Monad capture before starting the next authorized game. A slow randomness fetch remains independent of ticks. All writers run as UID 1000.

Compact observations record actual revealed effects and reset signals, without frames, commands or private payloads. Per-observer counters make retried writes idempotent and preserve cumulative signals across process restarts. Coalescing a reset with a newer snapshot does not erase the reset evidence. Seven-day retention is enforced at service initialization. These observations are diagnostics, not a source of official results or a standalone availability measurement.

The next common pool emits `SeriesResultRecorded` on Monad for each changed verified capture and finality update. This contains the full arena/epoch/match reference and tournament ID. It needs no separate archive signer or result-submission transaction. Envio accepts only the pinned pool and its explicit arena list from `deployments/agent-series-index.json`, preserving historical rules and the shared three-replay policy. A canceled unstarted fixture consumes no replay place; duplicate capture does not create another archive record. Frame recording and the final live indexer rollout still need qualification. The frozen `8a9d26b` pool does not emit this new event.

Only a completed match updates tournament controller memory. An unstarted canceled league fixture carries memory from before its series; copying it back would erase learning from a completed earlier fixture involving the same bot. A regression test follows the real tournament schedule to a championship and verifies that a budget drain preserves that earlier learning. This follow-up changes the immutable common pool: the `8d5e54b` base-only deployment is not the final candidate and must not be opened as such.

## Qualification still required

- Real multi-match execution and publication on hosted Interlude, including both modes, event proofs and maximum-duration/overtime releases.
- Actual reduction in occupied delegations and total costs, with bounded batches and enough verified spare capacity.
- Real human challenge/family reuse, versioned readers, UI, sponsor, indexing and historical repair end-to-end. Source now supports version-3 manifests/rules 11, preserves each historical game and refuses to attach a live node to an unstarted reservation or an earlier completed game. Contract and client tests are not hosted qualification of this new integration.
- Complete tournaments, correction and restart tests, followed by a new unchanged 24-hour trial and browser checks.

The disposable hub tests are not evidence of hosted admission capacity. The 100-command synthetic human trial on the earlier pool is not physical Mera authentication evidence and does not qualify this new arena. Public switches stay closed until all applicable delivery gates pass.

## Hosted checkpoint, 19 September 2026

Candidate `8a9d26b` was deployed privately. Pool `0xd1cc910fea9b3b705cef6982281701d3c7d5aaa8` owns the rules-11 arenas `0xd7c72a69c01b9ca62f10ba05a2614cd1af3e0eeb` and `0xbe12acef62ca94de2c711678f314f2daf5159d73`. Public admissions remain disabled.

The first arena opened epoch 1 at transaction `0xea217761af97134b9e80922cff29ea469b05e08bed31fe12dbdc848d1a588ad6`, block 64000780. Its first five-minute Classic qualification completed and was captured at `0xa21a94a0becebb9adb059a4aa96d1d59c960aa046c7c7cfe4107faa1351f9281`. The engine then started match 2 in the same epoch while preserving match 1. This proves a real consecutive-match transition; it does not yet prove end-of-series release, rotation capacity, Chaos series, or continuous availability.

`scripts/agent-series-evidence.ts` collects paced, block-pinned public state and compares per-match publications with their captures. It checks arena bytecode and complete references, excludes deployment keys, and reports pending capture separately from a result mismatch. Reports remain explicitly partial until the other gates pass.

At 23:07:20 UTC, block 64008985, the first arena had captured three Classic results (2–6, 5–2, 5–2), closed with 1,054 batches and was awaiting its actual release deadline. The second had captured Chaos 5–1, Chaos 2–3 and Classic 2–5, closed with 1,149 batches. Its opening followed the safe release of an obsolete private pool arena, without increasing the validator limit. These are genuine sequential matches with independent results. Both series were then in their challenge windows: two configured arenas alone have not demonstrated continuous availability, and release/renewal remained unproven at this checkpoint.
