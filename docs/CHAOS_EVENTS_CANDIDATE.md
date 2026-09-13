# Chaos events release qualification

Reviewed: 2026-09-13. Rules 6 passed the hosted gameplay, randomness, publication,
payment and command-latency release gates. Public manifests identify the
production-bound deployment; the final deployment procedure remains below.

## Implemented scope

The complete 24-event catalogue is in `shared/chaos-events.ts`. Classic retains
its existing physics. Chaos draws at committed 8–12 second intervals, announces
for one second without stopping the ball, and permits two effects in addition
to betting pressure. Events 1–20 have weight 4; events 21–24 have weight 1.
The draw calendar survives points, while active effects, obstacles, charges and
the second ball do not. No active event can be drawn again.

- `ChaosEffects`, `ChaosModifiers` and `ChaosRally` implement charges,
  consumptions, targeting, expiry, size/speed combinations, real rally numbering,
  simultaneous goals and jackpot scoring. Scores stop at seven; friendly games
  do not change ELO. Duplicate MYSTERY PICKUP rewards refresh the existing bonus
  for the last hitter and free the capsule slot, without multiplying its power.
- `ChaosPhysics`, `ChaosDynamics`, `ChaosContacts` and `ChaosGeometry` implement
  continuous collisions, a fixed 10 ms force grid, portal locks, non-solid
  overlapping activations, independent balls and bounded resumable catch-up.
  TypeScript uses the same fixed-point arithmetic. Numerical failure causes
  technical cancellation, not an invented winner.
- `ChaosCodec` packs gameplay into eight words. Immutable stateless modules
  and an external library keep the root within EIP-170. The worst-case test of
  two ranked games changes 63 of the node's 64 permitted storage slots, including
  first control grants, pressure and both results. This narrow margin is a
  release constraint, not spare capacity for more games.
- `PongChaosEvents` binds admissions, arcade controls, draw commitments, ELO and
  game epochs. Inputs remain compact; proofs are sent only for scheduled draws.
  Rules-6 pressure signatures use the real rally and a separate domain. Existing
  rules-5 signatures and contracts retain their meaning.
- `ChaosEventsSettlement` binds realtime Monad markets to published results.
  It freezes payment results independently of engine uptime. Permissionless
  `recordMatch` publishes versioned history events from verified contract state.
- Snapshot/receipt/WebSocket decoding carries effects, both balls, collisions,
  draw requests and explicit nonces. A contiguous pushed event that overtakes
  HTTP is retained without falsely declaring an engine restart.
- The VPS transports committed drand proofs through one journaled signer.
  Replays use app/epoch/match references and the existing global three-matches
  policy. Retention waits for Envio; financial entities and summaries survive
  pruning. Corrections never resurrect deleted frames.
- The court uses its existing render loop for all 24 original pixel icons,
  announcements, two effect indicators, obstacles, paddle treatments, two trails
  and identified sounds. No extra audio context, camera shake, moving background
  or 3D runtime. Reduced motion preserves rule cues.
- History, replay controls, betting explanations and English guides cover the
  new rules. Older match references and balances stay separate.

## Randomness qualification

`DrandEvmnet` pins evmnet chain hash
`04f1e9062b8a81f848fded9c12306733282b2727ecced50032187751166ec8c3`,
the BN254 public key, unchained G1 scheme, genesis 1727521075 and 3-second period.
It rejects malformed lengths, infinity, noncanonical coordinates, invalid points
and invalid pairings. The game verifies the committed future round, application,
chain, epoch, match and draw index. Independent domains select event, target,
variant and interval. Late proofs delay events without rewriting past physics
or substituting an older beacon round.

Vendor: `randa-mu/bls-solidity@11af179a8287d978659aae07adb66aa60f64b8a6`,
with MIT notices. Experimental and unaudited; our review and tests are not an
independent cryptographic audit.

The real hosted verification and Monad publication gate passed on 2026-09-13.
Probe `0x6706442df3d8363d14d0aa40e7ae52256df55b18` verified future-committed round
20596048. Batch 1 published at block 62212331 in transaction
`0xbcd45f98ab157f24ae0cd1527cbbfc613c0a54c7aa0ff261b6036d07f430f818`.
One live write measured 108.7 ms, with 270 signed bytes and 1,476 publication
calldata bytes. These are single-probe measurements, not multiplayer percentiles.
The probe was closed and released after the actual contest window.

## Hosted gameplay evidence

The first full candidate, `0x3c4e786ce22f26ba8c41eb2d4e8ac936ee05117e`, completed
two concurrent Chaos games, both 7–6, with six real verified draws. Exact scores,
winners and revisions matched Monad across five successful publications. Batch
calldata sizes: 9,092, 10,468, 7,588, 7,876 and 9,476 bytes. No 413 occurred.
Calldata is not the hosted service's internal relay HTTP payload size.

This run used scoped grants and stationary test players. It does not replace
the subsequent 100-input, browser or payment tests. Its published batches are:

1. `0x633f298c895c40840c76b634eb5f914f576de377908b01c5cf97ba49efb4d46a`
2. `0x4fad5e92577639105d9673fad54a5cbb9b503ebae838fd407c45658a30ef5763`
3. `0x521993f308b7c721fb446b72553cb54fc96ec9b2a0b3939120bd080dea101dbf`
4. `0x7cde74fb41fe298d2e51d9a57f4fad2d5382b29400df1bd36ea34eff8c2eb05c`
5. `0x8e9617a511ca143f40b247ae924767af4989664644cc40ae534a1b1ff80e9332`

The latest integration root is `0x4ace43735d1e5b0aa9b2d54a76ea4ac99089bb91`,
runtime 24,236 bytes. It adds per-game epoch discovery and clears ended ball
state. Its hosted opening succeeded after the earlier test was released.

| Component | Test address |
| --- | --- |
| Settlement/archive | `0xf872ef6f2dbe57e13cd4137912ed10576a03b7c9` |
| Market | `0x07ba4e37ac0f66313d7f5bfad4d3cbac5796bbe7` |
| Vault | `0x2a3ee21fd3f64df8915e6c550e222ef062f32f6b` |

These use disposable fixture identities, not production manifests.
The first integration run completed Classic 7–5 with 102 changes per player.
Chaos exposed an HTTP/push race and was recovered from actual contract state.
Its 3–7 result published, followed by a 0.006 MON wallet payment in transaction
`0xdfa671129cb2016f4e43c8ac5106d6647930206c3b0afaf16239bf068b045a43`.
The recipient did not sign to receive. The interrupted run remains failure
evidence; the HTTP/push race was fixed and the complete rerun passed.

The corrected run finished Classic 4–7 and Chaos 7–6, with at least 102 direction
changes per player in each mode, four restored controls, three verified draws,
actual betting pressure, and a second 0.006 MON wallet payment:
`0x6d26b16d3f8fd1e383c21399bbc3df6031f75c74086257141824f0961865e79d`.
Both sides were backed with real test MON; receiving required no signature.

Two concurrent games on final bytecode finished 6–7 and 7–6 with six verified
draws. Five publication calldata sizes were 15,108, 7,556, 7,684, 9,636 and
4,516 bytes. Both results matched published state, with no 413.

The real Chromium flow used two players and one spectator per mode, the actual
isolated PostgreSQL coordinator, hosted SDK and Monad. Classic and Chaos both
finished 7–6; all players issued more than 170 inputs. F5 restored controls;
both players saw their result and the spectator saw a neutral winner. No page
exceptions occurred. Synthetic EOA owners were used, not physical passkeys.
Archive transactions `0x48bf9da05c9267521442e19f55ebfac88c9c7b35649a940f75a72cf60c83fe4e`
and `0x652cdba92eba23596add394d0dbc718d00c610e7738a5cac9d9f2b3de6b1a874`
were indexed by a real Envio process. Both 133-frame replays remained usable
after closing the engine, including authentication, seeking and playback.
A collapsed replay court was found and corrected with an explicit 16:9 layout.

All 24 sound announcements produced measured output in Chromium and Edge 153,
with mute, suspended-context behavior, deduplication and the 12-voice limit
verified. These signal measurements do not certify the listener's speakers.

## Production-bound deployment and final comparison

Game: `0x78d3341e3452d7ec1add9371de3008639eed8eb0`.
Settlement: `0xd7602b6ae87798e0f39ea25b97f75dcc5dd0822f`.
Market: `0x1e7495756ef16d16ec9675080b6f147bf3424a3c`.
Vault: `0xfb246085d94984f01a6fc7973ae29fcef7b85929`.
The public `deployments/chaos-events.json` contains modules, deployment and opening
transactions. Twenty inherited account/mode ratings were compared against the
pinned published predecessor state. No existing funds were moved.

The first run on this root found a payment discovery delay: the financial log
cursor was thousands of blocks behind a recently deployed contract. Its result
was recovered from actual receipts and paid, preserving the failed run. The
relayer now consumes its verified Monad bet/payout receipts immediately, with
idempotent database writes. Historical and recent log retries do not hold known
positions hostage; amounts and recipients still come from the contracts.

HTTP receipts could also overtake an adjacent applied event. A bounded eight-frame
buffer now reorders contiguous events, with a maximum 30 ms delivery grace before
an authoritative read. Disconnections, backwards heads, malformed events, real
gaps and unknown winners still require reconciliation. No input nonce is guessed.

All measured runs are retained in [the validation record](validation/chaos-events-20260913.json).
Percentiles use nearest rank, `ceil(n*p)-1`, not interpolation:

| Run | Inputs | p50 | p95 | p99 | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| Rules 5 baseline 9 | 424 | 111 ms | 123 ms | 264 ms | Passed |
| Rules 5 baseline 7 | 413 | 108 ms | 122 ms | 253 ms | Passed |
| Rules 6 run 9 | 422 | 118 ms | 208 ms | 300 ms | Payment discovery timeout, subsequently recovered |
| Rules 6 run 8 | 415 | 117 ms | 150 ms | 233 ms | Passed, latency threshold missed |
| Rules 6 run 7 | 430 | 120 ms | 170 ms | 259 ms | Passed, receipt-order spikes remained |
| Rules 6 final run 6 | 441 | 118 ms | 134 ms | 208 ms | Passed after reordering fix |

Final p95 is 9.84% above the latest baseline, within the 20% gate. Classic p95 is
131 ms; Chaos p95 is 137 ms. Measurements include sending and receipt/cache
reconciliation from the VPS. Nodes differ between generations. These are
workload-specific measurements, not a browser-to-screen or finality guarantee.

The final run finished Classic 3–7 and Chaos 7–6, with 102 changes per Classic
player and 135/102 per Chaos player. Four future-committed drand proofs verified.
The disconnected recipient received 0.006 MON automatically in
`0x75ff3067bff31bc9288a977520d3b5a8e02cd8a41a9adccaca3a0c030998dc45`.
Real Chromium on this same root also completed Classic 6–7 and Chaos 7–6 with two
players and a spectator, F5 restoration, matching terminal scores and no page
exceptions. That browser run preceded the final transport reordering fix; the
fix was then exercised through the real 441-command SDK run and regression tests.

## Validation and scope

- 10,000 candidate Chaos physics comparisons matched Solidity/TypeScript, plus
  10,000 Classic and 10,000 legacy realtime Chaos comparisons. Zero mismatches.
  Draw and modifier suites add 10,000 comparisons each.
- All 276 pairs pass physical call-partition comparisons and contract scenarios
  for reconnect serialization, concession cleanup, point cleanup and expiry.
- Tests cover cryptographic mutations/replays, jackpot 5→7 and 6→7, simultaneous
  goals, ELO application, rejected transfers, reentrancy and repeated payments.
- VPS PostgreSQL tests cover global cross-generation retention, delayed Envio,
  corrections, strict frame cursors and late writes after pruning.
- Chromium and Edge 153 pass the private production-build UI fixture: two
  players, Classic/Chaos, countdown, F5, 429 recovery, 100 key changes, all event
  indicators, 360/390/768/1440 px and both result views. Its RPC/wallet calls are
  simulated. Real contract execution is reported separately above.
- An isolated Edge projection/drawing benchmark measured up to 0.6 ms p95,
  or 2.2 ms with simulated CPU slowdown ×4. This is neither mobile hardware
  measurement nor input/network latency and does not establish FPS.
- Final local suite: 344 contract tests passed, two optional live-fork tests
  skipped without an explicit RPC; 202 TypeScript tests passed. Production
  frontend build, TypeScript and static docs generation pass.
  The optional fork tests are distinct from the successful real hub lifecycle.

## Deployment and rollback

The original admissions were drained before pinning inherited ratings. The
completed integration fixture was closed and released through the real hub.
The new hosted engine opened at epoch 1, published results and verified draws,
and settled actual bets. Two simultaneous Chaos matches were also qualified on
identical runtime bytecode, with no 413 publication failure.

Backups include all production databases, financial and lifecycle journals,
configuration and private operational keys. Backup `20260913T195138Z` has ten
verified database dumps and an off-VPS copy. The fresh indexer is restored into
`pong_indexer_events_20260913` under its original database role. The previous
`pong_indexer_neon` database is retained.

Deploy the published commit's web and relayer images with the rules-6 manifests,
`ROOMS_ADMISSION_ENABLED=true`, `ROOMS_CHAOS_ENABLED=true` and state streaming.
The indexer uses the new database; Hasura must use that same database. Check
public config, health, authentication, the catalogue and payment status after
switching. Sponsoring remains without a daily budget cap.

For rollback, first stop admissions and let active games complete. Keep the new
relayer and immutable financial manifest entries so rules-6 payments and archive
links remain resolvable. Restore the previous web image only after verifying its
routes against the new relayer. Do not silently reopen ranked play on the old
engine: inherited ELO was pinned when the new session opened, and two active
ranking branches must not diverge. Keep the old indexer database read-only for
recovery; never overwrite new transaction journals with a pre-release backup.
This is still the multi-room deployment with a shared delegation. Independent
per-match delegations are a separate architecture, not claimed by this release.

On 2026-09-13 the owner explicitly authorized resetting indexed match history
instead of waiting for a full historical backfill. A fresh private Envio database
starts at block 62,260,200; all legacy contract bindings still observe subsequent
events. The previous `pong_indexer_neon` database and its off-VPS dump remain
available for recovery. This resets the indexed history, not wallet/vault
balances, onchain ELO, pending payments, contract rights or transaction journals.

Root and indexer dependency audits found no reported vulnerabilities. Gitleaks
found no secrets in all 131 existing commits or the staged-publication candidate;
the final publication-tree check is repeated before pushing. The vendored BLS
implementation remains experimental and unaudited despite functional tests.

Physical passkey recovery, real mobile hardware and human audio listening remain
separate validation limits. A provider capacity/publication refusal keeps the
current production active and is reported with exact evidence.
