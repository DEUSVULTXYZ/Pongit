# Bounded agent series candidate

Status: private implementation and qualification only. Human production, Agent Arcade and public tournament admissions remain closed. The previous one-match pool and its evidence are preserved. This candidate does not establish continuous capacity or a passing 24-hour trial.

## Browser reload diagnosis, 20 September 10:00 UTC

Browser run 12 remains failed: its 36.7-second Classic challenge ended 0-7 before
controls returned after F5. It sent no movement and exercised neither injected
fault. Its original PRF context is closed. This is separate from run 11's actual
two-hour original-PRF renewal proof.

A read-only replay of navigation to that published match isolated the delay.
The fixture routed configuration, catalogue and match reads to the sponsor,
whose internal RPC path made each read take 8-10 seconds. The sequential page
bootstrap took 31.1 / 31.8 seconds although document loads took under one second.
Routing those reads to the dedicated reader, exactly as `ops/agent-pool.caddy`
specifies, reduced result display to 1.9 / 0.9 seconds on the same existing build.
These are historical-page observations, not live F5 or latency qualification.

The browser fixture now separates reader and sponsor routes and records API and
reload timings without request bodies. The arena UI also loads configuration
and match reference together, with optional profile labels outside its control
recovery path. A browser regression holds the catalogue response while requiring
the real built UI to show its synthetic live court. Type checking and 24 focused
authorization, recovery and reader tests pass; the new build and hosted browser
run are still required. Reports `series-browser-12.json` and
`navigation-check-{1,2}.json` are preserved in private diagnostics.

## Cumulative coverage, 20 September 09:02 UTC

The read-only `agent-series-coverage.ts` audit matched 18 observed completed
games against their versioned arena bindings, Monad publications and common
ledger captures. All 24 Chaos effects were observed across those games, with
no observer resets in the included records. This is cumulative evidence from
several private controller builds, not the required unchanged 24-hour trial,
all 276 combinations, or an animation review.

Registry checks now qualify NOVA, PULSE, ONYX, VECTOR and DRIFT in both modes.
ECHO, GLITCH, VIPER and the community Tracker still await qualification. DRIFT's
latest Classic result was 3-4; Chaos ended 1-1 at the regulation limit. Both
results matched their captures. Both arenas are closing, so this is still
evidence of insufficient reserve capacity, not continuous service.

The audit pins Monad reads to one block, checks arena runtime hashes and excludes
uncaptured, inconsistent or reset observations from effect coverage. It exports
only public references and compact diagnostic counters, never deployment keys
or grants. Its original report is `series3-runtime/coverage-20260920T0900.json`.
Public opening remains unauthorized by this report.

## Earlier checkpoint, 20 September 04:15 UTC

The corrected SDK example was deployed as immutable strategy
`0xd36361a5516a73307bf95cdb7495590bbb49ae59` and registered through the actual
private sponsor. Availability is enabled, but both qualification bits remain
unset until real matches pass. Its metadata-free runtime passed the same opcode
policy as the contract. SDK `0.2.0-candidate.2` passed an isolated clean Node 24
installation; it has not been published to the npm registry.

Browser run 6 failed during renewal of an imported virtual passkey. A separate,
network-isolated Chrome experiment established that CDP credential export/import
does **not** restore the PRF extension secret: repeated assertions with the
original authenticator succeed, while the imported credential provides no PRF
output. That failure is not evidence of a broken physical Mera passkey. The next
test retains a fresh original authenticator across the actual two-hour expiry,
without modifying the chain clock or manufacturing a shorter authorization.

The failed run also exposed a UI issue: successful catalogue polling cleared
unrelated connection errors. Action, catalogue and queue errors now have separate
lifetimes. A browser regression check requires an actual background catalogue
refresh before asserting that a refused passkey request remains visible.

These source changes do not establish continuous arena capacity. Public human,
agent and tournament admissions remain closed, and no final 24-hour trial has
started. Every previous failed or incomplete report is retained.

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

## Release and corrected candidate, 20 September 00:10 UTC

The first grouped arena completed its normal release after 1,054 batches, transaction `0x2a4f6b4651d5413a5c9462b9d44a33da190018af8e382e9fa1ac35d5cb52254a`, block 64015842. Release used 2,721,980 gas and 0.27764196 test MON. Epoch 2 then opened and published a new five-minute Chaos match, 3–4, captured before block 64017599. Release, renewal and a new result are now demonstrated for this observed case. They do not establish the maximum-duration/heavy-input bound or sufficient reserve capacity.

The three arenas of the superseded single-match private pool have also been released. Its controllers are stopped and its journals are retained. The first grouped prototype is now draining: new admissions are disabled, completed results are captured and unstarted reservations remain explicitly distinguishable from played games. A replacement drain container initially lacked its scope variables; restoring its complete original configuration with all admission flags off resumed maintenance. The human production and frozen September-18 trial were not modified.

The corrected private deployment uses contract source `0574742`: pool `0x4d8d809d72ea74b6ac0a1ab86aebbb41c71146a1`, arena `0xb29db94965f9c8d8f9325ade2a8cbccf46e4d7cb`, and arena `0x6d96b457b6295fb6f9764f7149acb328ff80a2e4`. Both arenas opened independently. Classic and Chaos each completed 2–6 at the five-minute limit and their published results matched their captures at block 64020558. Both controllers made 3,000 decisions per match with zero invalid decisions. Chaos submitted 28 confirmed proofs and observation recorded 12 distinct active effects; this is not all-24-effect coverage.

Each spare-lane qualification occupies one session so an already scheduled second qualification cannot precede a newly waiting human. With only two candidate arenas, both are currently in the protocol exit window. This is an explicit capacity limitation, not continuous availability. Qualification and full tournament testing remain private; no final 24-hour trial has started.

Controller source now gives a fetched randomness proof priority after the current tick finishes, using the existing nonce owner. Fetching the beacon does not suspend ticks. The proof is rechecked against the current match/request before signing, and transport failures retain their normal reconciliation. Tests cover the tick/proof race, stale proofs and lost responses. Retry diagnostics now preserve a sanitized reason instead of reporting an undifferentiated retry. This controller change still requires its next hosted Chaos run.

At 00:18 UTC the real private HTTP reader passed catalogue, ETag, completed Classic/Chaos and wrong-epoch 404 checks. Completed matches had no live node attached. The actual `SeriesResultRecorded` logs matched both published scores and full references: transaction `0x615845bc4c161b8c4b8a9e8f116e72398863cfc20a8ae39120e4df3264416d36`, block 64019205, and `0xa5e85aee32775b6489e4d4fb77a2cfbfb8252a21e8707900efe9acf65bc4cba3`, block 64020514. An initial read-only history request failed with a larger direct-RPC block window; the preserved second report passed with 100-block windows and paced calls. These checks sent no gameplay or financial transaction. A separate real Envio backfill is still in progress in a new isolated database.

## Human challenges and replay integration, 20 September

The corrected pool admitted a synthetic human against NOVA in Chaos after renewing the first arena to epoch 2. Exact receipt recovery after an injected lost reply, injected pre-send 429, owner revocation and renewal all passed. Four randomness submissions were observed on the new serialized proof lane. The bot won 0-7 before the movement target (27 confirmed changes); the original partial report is preserved, not counted as a completed 100-change test.

The same synthetic owner reused its scoped family on the second arena after its renewal. A separate Classic run completed **100 confirmed direction changes**, median **113.98 ms**, p95 **387.13 ms**, then conceded. The published 1-2 result matched the concession, hash `0x35d1bbb554c7b2b731561c0c1f4c0fa9e7702830f7cf066116aada598ef25a8b`. This is a hosted SDK test, not physical Mera or a natural seven-point finish. Permission checks are explicitly referenced to the preceding preserved run rather than repeated inside the movement test.

The obsolete first series pool's last arena was released at block 64032546. A fresh read at block 64032825 found both old arenas at hub status None and zero pending maintenance jobs; its keeper and controllers were stopped. Their data and transaction journals remain intact.

The next source records accepted engine snapshots under the full chain/app/epoch/match reference. Recording never blocks commands, has a bounded queue, 4,000-frame and 16 MB per-match limits, and a 256 MB recording reservation budget. Loss, overload or recorder restart labels the replay partial. Scores still come from the published contracts. Each replay read compares that result and the shared Envio retention record; a missing index preserves data, a corrected result hides stale frames, and a retired replay keeps its summary. The API serves `/agents/replay?app=...&epoch=...&id=...`; the existing replay player uses the recorded rules version and labels partial recordings.

Thirteen real PostgreSQL/HTTP checks passed against synthetic contract/index states, including epoch isolation, rollback, compression, restart, lost writes, corrected results, shared retention, ETags and fair reconciliation when an old contract is unavailable. A first expanded test harness used an incompatible mock of PostgreSQL's callback overload and stalled; it was stopped and preserved, then the adapter was corrected. This does not substitute for recording and serving the next real hosted game. The production web build and all 443 TypeScript tests pass. Public admission gates remain closed; no final endurance trial has started.

The off-VPS backup was restored into four isolated databases. Every COPY row, compared by per-table sorted hash, and every sequence value matched its dump: 1,138 rules-9 rows, 832 series operations rows, 238 indexer rows and 24,457 relayer rows. No production database was overwritten and no service was started on the restored copies. This validates that backup, not subsequent writes or the future release backup.

## Browser integration checkpoint, 20 September 02:40 UTC

The first real Mera browser attempts on the replacement pool exposed a build
configuration defect: its CSP omitted both new arena origins. The browser could
register a family and queue a challenge but could not observe or control the
engine. The two resulting 0-7 games are real publications, not passing human
gameplay tests. Their failed reports and the original private family are retained.
The web build now requires its explicit public pool manifest when building this
candidate. The real-browser harness checks delivered HTTP and WebSocket policy
before creating an identity or requesting an arena. Public production is unchanged.

Match 5 of epoch 3 on `0xb29db94965f9c8d8f9325ade2a8cbccf46e4d7cb`
produced 51 recorded snapshots and a published 0-7 result. The replay API and
conditional ETag reads passed. Chrome and Edge at 360 and 1440 px passed playback,
seek, final score, focus restoration and zero engine-call checks. Visual review
then found that the shared live-layout container could collapse the replay court
to zero height. That earlier report is therefore **not a complete visual pass**.
The replay now uses its own 16:9 CSS module; the next browser run also asserts
visible dimensions. No simulated recording is substituted for the real match.

The package `@pongit/agent-sdk@0.2.0-candidate.1` adds a current pool registration
example and CLI. It uses the existing sponsored registration and an explicitly
requested creator-paid availability transaction. It journals exact signed bytes,
binds recovery to the creator/chain/target/calldata/value/nonce, refuses an
unexplained consumed nonce and never persists the private key. Fourteen targeted
client/sponsor/recovery tests passed, as did an isolated clean package installation
on Node 24.20.0. The CLI rejected an unapproved endpoint before creating state.
This is not a completed hosted community qualification or npm registry publication.

The immutable pool and arenas are still the `0574742` deployment. Neither this
documentation update nor the browser fixes establish reserve capacity, complete
tournaments or a final 24-hour service trial. All public admission gates stay closed.

## Browser and availability corrections, 20 September 03:10 UTC

The corrected replay build `8cae1ab` passed the real-recording check on Chrome
and Edge at 360 and 1440 px. The test now measures the visible 16:9 court and its
mobile screenshot has been inspected. Playback, seeking, published 0-7 score,
focus restoration and zero engine calls passed. The earlier zero-height-court
report is retained as a functional-only result.

The next live browser run reused the original virtual Mera family on epoch 4,
Classic match 7, including F5 and an intentionally lost executed response. Both
player and spectator reached the published 0-7 result. The game ended before its
later 429 injection, so this is **not** a complete fault-recovery pass. The Chaos
portion is still pending at this checkpoint. No physical authenticator was used.

The source now separates routine mutable-permission checks from full recovery,
retaining the established signer and nonce during healthy observation. A failed
movement requests reconciliation on the next observation rather than waiting
for the ten-second periodic check; actual server cooldowns still apply. Tests
cover revocation and lost-response recovery with consecutive nonces. This change
requires a new private web build and real browser rerun before deployment.

The new `agent-series-soak.ts` monitors the actual pool, its published API,
controller freshness and physical progress. It records reusable contracts
separately from progressing games, counts intervals without samples as unknown,
and fails its continuity checks when all arenas stop during renewal. Its source
inputs cover every executing backend role. A short diagnostic run cannot pass
the 24-hour gate, and this monitor never authorizes public opening. Full traffic,
costs, published results, all effects and real capacity remain separate evidence.

Original agent browser 11 renewed the retained original virtual PRF account
after its actual two-hour expiry at 09:17:05 UTC on 20 September. This passes
that specific expiry/identity gate only. Its earlier Chaos wait failure and
empty fault coverage remain failures; the following real match is pending.

Run 11 subsequently timed out waiting for its post-renewal arena. Its challenge
was later admitted as epoch 10 / match 19 on b29, published 0-7, and closed at
09:30 UTC without browser control. The original failure is preserved. Fresh
run 12 uses the earlier fault injections and records up to the real protocol
exit-window wait; it is not a continuation of run 11's authenticator.
