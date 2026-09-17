# Agent Arcade candidate

Status as of 2026-09-17: the dedicated 24-hour trial ran its full clock but did not qualify, and the dedicated Interlude node has been unreachable since 2026-09-14T23:45Z. The human production feature gate remains unchanged, the public flag was never opened, and no bot process has been launched on a human arena.

## Contract candidate

- Monad Testnet: 10143; execution chain: 4242; rules: 7.
- Application: `0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9`.
- Deployment transaction: `0xb85159833ba9cc26cee8f2b9a33250c7b9fe0ae4022b4a0cfa2b500d2c785b6c`.
- AgentIdentity library: `0xccaebf3146e4f17d8ca1967d5cdd9334823e62ce`.
- Separate coordinator key, house addresses and business database. Private key files are excluded from the repository.
- Reuses immutable physical modules; no market or vault is deployed. Financial pressure submissions always revert.

## Qualification gates

- Agent-specific contract tests pass, including the 24 effects, all 276 pairs, five-minute leader/draw handling, the seventh point, creator restrictions and human ELO isolation.
- Full contract regression: 368 passed, zero failed, two real-hub fork tests skipped because no fork configuration was supplied. Additional agent isolation tests are tracked separately.
- TypeScript regression: 208 passed, zero failed. Differential physics: 10,000 Classic cases and 10,000 current Chaos-event cases matched exactly; the older realtime Chaos mirror also passed 10,000 comparisons.
- Chrome and Edge: catalogue, connection dialog, live canvas and spectator result checked at 360, 390, 768 and 1440 pixels against a captured private production build with simulated APIs. These are not hosted multiplayer proofs.
- Ten real PostgreSQL/HTTP integration scenarios passed with explicitly mocked contract reads, including duplicate operations, compact-key revocation, authenticated reconnect checkpoints and reserving the next duel after an engine result but before its publication.
- Dedicated contract suite: 24 tests passed. Next.js production build and Envio generation/type checking passed.
- Hosted admission initially returned `ValidatorAtCapacity()`. After releasing the verified idle predecessor, the dedicated node accepted epoch 1. The candidate is not publicly enabled.
- A verified drained predecessor was closed to release its unused validator allocation after the actual hub deadline. The human active application was not closed.
- Five complete hosted games were published on Monad: matches 3 and 5 in Classic, 4, 6 and 7 in Chaos. Matches 4/5 overlapped, as did 6/7. NOVA, PULSE, ONYX and the separately hosted SDK example passed both mode qualifications.
- Epoch 1 was closed only after both slots drained and pending diffs reached zero. It was released at block 62316540, and epoch 2 opened at block 62316763. The services resumed on the verified epoch, and human-agent match 11 completed 2 : 7 and was published at block 62317408. This completed the hosted renewal cycle.
- The 24-hour soak ran from September 14 at 01:30:39 UTC to September 15 at 01:30:39 UTC and did not qualify; see "Why the 24-hour trial did not qualify" below. Earlier trials were stopped during fixes and retained as incomplete reports, including the cached-grant renewal issue described below and completing traffic measurement for the external controller and operator steps. Source hashes, sample gaps, availability and storage deltas are recorded; elapsed time alone does not open the service.
- Real HTTPS-origin browser qualification passed human-agent Classic (3 : 7) and Chaos (4 : 7), with matching spectator results, F5, a response lost after actual execution and an injected 429 before submission. One virtual Mera credential creation was recorded, with no further credential ceremony between games. This is not physical passkey recovery evidence.
- Concurrent public human games passed Classic (7 : 5) and Chaos (5 : 7), each with two players, a spectator and F5. They used the existing human application while the dedicated agents ran separately.
- Real shared-indexer backfill passed again on 2026-09-17 at 19:22 UTC against the unchanged private database: 522 agent results matched published identities, modes and scores alongside eight human results at rules version 6; 20 shared player lists had the correct latest-three ordering, and 510 pruned results retained their summaries after their replay frames were deleted. The private rebuild starts at the unchanged production history boundary, block 62260200; it does not reset the human database.
- A live exported PostgreSQL snapshot restored successfully with exact counts for all 16 agent tables, without stopping games. The restore was repeated on 2026-09-17 with writers stopped: 16 tables, identical counts, the scratch database dropped and no residue left behind. Production backup scripts include the optional agent database, metadata and bot command journal, and the offsite copy now accepts and verifies them: it previously rejected `pong_agents.dump` outright and checksummed only the database dumps, so the agent metadata and the bot command journal travelled offsite unverified. Checksums now cover every file in a backup, 67 rather than 10 on a current production backup.
- Required before activation: a fresh 24-hour observation that ends with the arena still online, a review of its actual availability, renewals, traffic, cost and effect coverage, and final public smoke tests. The trial of September 14 does not satisfy this.

## Why the 24-hour trial did not qualify

The report at `soak-1789349439085.json` records `complete: true`, `errors: []` and 92.47 per cent availability. All three are misleading, and the run must not be used to open the service.

- The environment entered an unrecovered outage at 2026-09-14T23:44:00.790Z and stayed in it until the final sample. The last 107 samples read `draining-for-renewal` and then `renewing`; the last 106.4 minutes produced no match, no on-chain job and no storage growth. The agent database is byte-identical to the report's closing figure days later.
- Epoch 2 opened on 2026-09-13T23:49:34Z and expired 24 hours later, 1 hour 41 minutes before the soak's nominal end, so the run always needed a mid-trial renewal. The lifecycle drained and closed epoch 2 on schedule at block 62595260, then could not open epoch 3.
- `https://il-4cecc7fb9f199fbd.fly.dev` has returned HTTP 503 since 2026-09-14T23:46:09Z. The human node answers normally through the same probes, so the fault is specific to the dedicated application. Nothing can be requalified until it is restored. Note that the node hostname is the first sixteen hex characters of the application address, not the whole address.
- `complete` asserted only that the wall clock had run out without a SIGTERM, and `errors` recorded only exceptions thrown inside the sampling loop. The arcade reported its failure as sampled data, so 104 error samples, ten reverted transactions, one `Engine reset is not yet consistent` and one `Agent engine confirmed a rejected action` were all omitted. `scripts/agent-soak.ts` now records sampled failures and stage tallies, requires the arena to be online at the end, and hashes its gating inputs as well as its source. Replayed against the September 14 samples, the corrected logic reports `complete: false`.
- Concurrency never reached the configured capacity: `maxSimultaneous` was 1 against `maxMatches` 2. Of 1,435 samples, 1,258 had one active match and none had two. The league branch admits only when the arena is empty, reserving the second slot for a human, so a trial without human traffic cannot demonstrate two slots.
- `/secrets/lifecycle.json`, which carries the `renewalQualified` precondition, was rewritten at 2026-09-14T23:47:18Z, during the run.

Sponsor cost attributable to the dedicated agent operation identifiers, derived from receipts in the shared journal: 12.694548414 test MON across 484 Monad transactions inside the trial window, and 16.155886692 test MON across 532 transactions all-time. Cost on execution chain 4242 cannot be measured, because `agent_arcade.engine_jobs.evidence` stores only hash, block and status.

What did hold: the source hashes were genuinely unchanged and re-verified afterwards, all seventeen matching the repository tree exactly; sampling had no gap beyond 62.245 seconds across 1,435 samples; the operator nonce journal has no gaps, no duplicates and no replacement transactions; every one of the 3,877 engine jobs carries receipt evidence; no match was published twice; ELO starts at exactly 1,000; and all 24 Chaos effects were observed inside the window, counted from the database rather than read off the report. Effects 21 to 24 appear in 32 to 45 matches against 103 to 130 for the others, which matches their draw weight of 1 against 4.

## The house policy in the contract

Rolling the epoch protects the stake but costs availability, because the challenge window is an
hour whatever the epoch length. The cause is upstream: a match costs about 695 execution-chain
transactions and 99 per cent of them are house-bot `input` calls. Each one runs `_advance` and
writes the control word, and those writes are the diffs that become batches. Moving the policy
into the contract removes them; only `tick` remains, and the tick cadence is ours to set.

`contracts/src/agents/HouseController.sol` is the policy from `shared/agent-controller.ts`. Every
function is pure and reads no storage, so the caller loops it against `PhysicsV2.advance` in
memory and a whole tick still costs one storage write. The shared physics library is untouched:
`advance` is `internal pure` over a memory state, so the arcade sets `leftDir` and `rightDir`
between sub-advances rather than reaching inside a library the human application also uses.

The library works in 1e12 throughout. The original divides everything into display units and
works in floats, which hides that the modes are scaled differently: legacy positions are
PhysicsV2's 1e6 units while Chaos packs positions in 1e12 and keeps velocities in 1e6. Scaling
Chaos down would discard precision the original keeps, so legacy is scaled up instead, which is
lossless. That also makes one formula exact for both modes: with a distance in 1e12 and a velocity
in 1e6, the arrival time in microseconds is the plain quotient and the predicted height is
`y + velocity * arrival`.

The constants were checked against the contract rather than copied across. The reflect band of 564
starting at 6 is `HEIGHT - 2 * RADIUS` offset by `RADIUS`; the planes 40 and 984 are `PLANE` and
`WIDTH - PLANE`; 288 is half the height.

`npm run test:differential:house` compares the two on states the physics can actually reach, built
with `initial` and `advance` rather than random numbers. It alternates the modes, pins the aim
error to zero on half the cases to isolate the geometry and uses a real error on the rest, and
forces a second ball on a third of the Chaos cases because MULTIBALL carries a draw weight of 1
and waiting for it would leave the soonest-arrival selection untested. It also counts what it
discards, so the coverage cannot be read as better than it is.

Over 10,000 generated cases: **9,700 comparable, 9,700 in agreement, none divergent**, across
5,000 Chaos and 4,700 legacy cases, of which 1,247 carried two balls and 1,233 none at all. Only
300 were discarded, all genuinely finished. The truncation gap between float and integer
arithmetic, which this was built to measure, does not appear at these magnitudes.
`contracts/test/HouseController.t.sol` adds eight boundary cases a random walk would rarely land
on: a ball travelling away, zero horizontal velocity, the dead-zone boundary, the wall clamp and
the Rookie hedge.

Two things remain before this can ship. The production entry point has to be `external` for the
library to be linked rather than inlined: with every function `internal` it compiles to 57 bytes
and would be folded into a contract that has 207 bytes of headroom. And the arcade still has to
identify which sides are house bots and decode their difficulty, which `AgentIdentity` can already
answer from `creator` and `metadata` without a new storage slot.

## Epoch cadence and the stake-release ceiling

Releasing a delegation's stake replays every batch committed during that epoch, in a single
transaction that must fit in one Monad block. Measured on this hub across nine real releases:

```
gas = 224788 + 83192 * batches
```

A 150,000,000 block is therefore exhausted near **1800 batches**, and past that point the stake
can never be released: the transaction cannot be mined at any gas price. Epoch 2 of the agent
application reached **8564 batches** and is stuck there permanently.

`batchIndex` resets to zero at every epoch opening, verified on chain at blocks 62316762 and
62316763, so closing early genuinely clears the counter. Batches are produced by gameplay volume,
not on a schedule: the validator seals a batch as soon as it holds `maxDiffsPerCommit` diffs,
which is 64 and belongs to the validator's terms, shared with every application on this hub. A
sampled batch carries about 42 execution-chain transactions, so 8564 batches represent roughly
364,000 of them, overwhelmingly paddle inputs from the house controllers rather than coordinator
operations. The operation journal records only the latter, which is why it shows 3877 rows.

`scripts/agent-lifecycle.ts` now closes on batch pressure first and epoch age second:

- `PONG_AGENT_MAX_BATCHES`, default 1000. At the worst per-batch rate observed (112,333 gas) this
  still releases in about 112,000,000 gas, comfortably inside a block.
- `PONG_AGENT_MAX_EPOCH_SECONDS`, default 14400.

Measured against the real epoch 2 traffic, a 1000-batch threshold closes after **2.92 hours** of
serving; 1800 would have taken 5.14 hours. The time cap will not normally fire at that play
density, and is there for quiet periods.

Two operational consequences. The validator's `challengeWindow` is 3600 seconds, so every roll
costs about an hour between `closeEngine` and `releaseStake` during which the arena cannot serve;
at a 2.92-hour epoch that is roughly 74 per cent availability. And serving a full four hours
requires holding batch production under 250 per hour against the 342 per hour measured, which
means slowing the house controller loop in `scripts/agent-house-worker.ts` from its current 55 ms.

Unrelated but adjacent: `ops/agents.compose.yaml` points the agent roles at the public Monad
endpoint, which rate-limits at 15 requests per second, while the human services use the project's
own gateway with 60 ms spacing. That is the likeliest source of the `InternalRpcError` storm in
the keeper log and should be given a dedicated gateway rather than sharing the human one.

## Hosted evidence

| Match | Mode | Score | Published Monad block |
| --- | --- | --- | --- |
| 3 | Classic | 7 : 4 | 62303254 |
| 4 | Chaos | 5 : 7 | 62303830 |
| 5 | Classic | 6 : 7 | 62303988 |
| 6 | Chaos | 3 : 7 | 62304344 |
| 7 | Chaos | 7 : 2 | 62304375 |

All references use chain 10143, application `0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9`, epoch 1. The result-discovery archive is `0x75656a40cd474ced383460ff0113022e9338a5ff`, deployed at block 62304867. It has no fund custody or payout entry point.

Opening transaction: `0xcab1f6eb97a22831f343d9996dbb7f288edd0f07b14a2ba36a5b09080fd7eb99`. Closing transaction: `0x35cbd78d10088759818a2ad7b9ef184f7e79ec5daa6163098e85099711497ab1`. These prove one hosted epoch, not an uninterrupted 24-hour service.

Release transaction: `0xe7447b2d73c63788b745fcc380d7cb93b217e986b1adef8d20db0f0725cf9199`. Epoch 2 opening: `0x0d2987c02e3441c2bac25f9e88809f95cfc71cb9b9ba658b1f6b25f364b3c30c`. The hosted node returned the expected application, epoch, rules and active health before admissions resumed.

The human application `0x78d3341e3452d7ec1add9371de3008639eed8eb0` stayed deployed and online. Separate real-browser reports record the simultaneous human tests; service health samples alone are not used as proof of gameplay.

## Browser measurements and corrected defects

The private routed browser used the real hosted engine. Among 216 actual `interlude_sendTransaction` responses, RPC response time was p50 105 ms, p95 174 ms and p99 194 ms. Sixty-two `eth_call` responses measured p50 99 ms, p95 167 ms and p99 207 ms. The injected 429 was not forwarded and is excluded from the network count. These are VPS-browser RPC timings, not display latency or a measured before/after improvement.

The concurrent human-browser run recorded 483 game submissions with p50 195.8 ms, p95 379.3 ms and p99 447.9 ms. Locations, traffic and game paths differ, so this is not a benchmark comparing the contracts.

Real-browser validation exposed and fixed a rejected next-duel reservation while the previous result was being published, restoration of a dismissed result during inbox polling, and a canvas retaining its default width. The old participation lock remains until publication; reserving a future duel cannot start a second simultaneous match for that player. Duplicate operations return the original reservation. Shutdown is idempotent, including repeated close calls.

The longer trial exposed repeated authentication just before a house grant expired: calling the SDK's default connection restored the still-valid grant rather than extending it. This hit PONGIT's authentication budget, not an observed Interlude quota. Controllers now explicitly request a new grant between games, preserve unresolved command journals, and respect API `retryAt` without unnecessary engine recovery. A real hosted qualification verified ordinary reuse, exactly one owner signature for explicit key rotation, the same five restricted selectors and a subsequent resume without another signature. The observation window was restarted after this correction.

Chrome and Edge captured-build checks were repeated after the canvas fix. Both modes fill the available cabinet at 360, 390, 768 and 1440 pixels, preserve 16:9 and do not shift when a Chaos effect changes. Simulated rendering checks and hosted tests are recorded separately.

## Rollout and rollback

`PONG_AGENT_ARCADE_HOME` defaults off. Enable it only after the dedicated manifest has both `enabled` and `qualified` set to true. The service uses separate keys, schema and container resources. A rollback disables this flag and stops admission to Agent Arcade while existing matches are drained; the human manifest and financial routes remain untouched.

Do not reset the operator's Monad nonce journal. Keep deployment, opening, closing and stake-release evidence there. Do not send a replacement command for a missing receipt. Stop admissions sufficiently before delegation expiry to allow every five-minute match to finish.

Diagnostics aggregate only destination, method, status, timing and rate. They contain no signatures, bodies, session keys or private profile content and expire after seven days. Keep actual hosted measurements distinct from isolated tests.

The endurance diagnostics cover five roles: coordinator, house controllers, the separate SDK example, delegation maintenance and result archival. Short-lived operator steps flush their own metrics before exit, including Monad reads and sponsored transactions. These calls must be counted separately from Interlude game traffic; early reports that omitted the operator are incomplete. The operator retains its original transport, transaction journal and nonce lock.

Permanent operations use the optional `ops/agents.compose.yaml` profile. Its private operator role handles lifecycle and archival separately with the existing Monad nonce journal. Role processes watch the metadata directory and restart only themselves after a verified epoch update; no Docker socket is mounted in production roles. Seed `ops/manifest.json`, `ops/lifecycle.json` and `ops/archive.json` with qualified metadata. Never put house keys in that directory. The archive worker revisits older results for corrections and never drops an unrecorded result merely because it is outside a recent-results window.
