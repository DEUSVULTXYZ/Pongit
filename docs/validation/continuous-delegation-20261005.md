# Continuous delegation and live synchronization — 5 October 2026

Status: implementation and live qualification in progress. No contract deployment or migration authorized by this report. The scheduled task remains paused.

## Protocol and call inventory

Production uses hub `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`, SDK 0.2.2 and Node 24.21.0. Canonical block 68394192: delegation fee 0.01 MON, stake 10 MON, challenge bond 100 MON, challenge window 3600 seconds, resolution window 900 seconds, maximum delegation duration zero and maximum diffs per hub commit 256. The node's operational limit is 233. Observed active epochs have zero expiry. Some numbers in the official deployment table differ; canonical values govern.

The adjacent JSON inventories direct calls, ABI declarations, wrapper calls, selectors and historical tools with file/line/method. Active execution paths and decisions:

| Path | Trigger / signer | Business purpose | Decision for active v3 |
| --- | --- | --- | --- |
| `scripts/agent-reusable-step.ts` → pool `closeReusableArena` → arena `closeEngine` → hub `closeDelegation` | Two-hour age, budget/lease reserve, failed node replacement; maintenance role | Rotation/capacity | Prohibited at decision and signing boundaries. Preserve current epoch. |
| Same keeper → `cancelledTournamentClosure` → `closeReusableArena` | Cancelled fixture waiting for finality; maintenance role | Unblock immutable `retryCancelled` | Prohibited. Keep publication/correction history; finality is not fabricated. |
| Same keeper → `recoverExpired` / direct `forceClose` | Lease expiry / overdue publication; maintenance or historical operator | Recovery | Prohibited for v3. No expiry renewal when `expiresAt=0`. |
| `independent-reusable-pool.ts` → human lobby `closeReusableArena` | Age, reserve pressure, failed node; original operator | PvP capacity | Prohibited for v3. Publication reserve still applies to new admissions. |
| `independent-reusable-lifecycle.ts` → lobby close / hub `forceClose` | Expiry or silence; original operator | Human recovery | Review state only; no closure transaction. |
| Keeper `releaseArena`; human lifecycle `releaseStake` | Canonical Exiting and real unlock deadline | Finish already initiated release, seal exact root | Retained. Does not initiate another closure. |
| `recoverReleased`, `sealReleased`, `captureProof`, `captureMissing` | Canonical released epoch or verified published proof | Preserve results, corrections, locks | Retained with existing proof/finality checks. |
| `openReusableArena` / arena `openEngine` → `delegateAll` | Initial deployment or an already released, sealed arena | Create usable capacity | Retained with actual terms, budget and exact nonce journal. Never paired with automatic closure. |
| Player `input`, `heartbeat`, `resumeReady`, `confirmReady`; engine `tick`, `randomness` | Bound session / engine signer | Points, countdown, play, next match | Live node calls only. No settlement or undelegation in movement path. |
| Separate pool/lobby/ratings/settlement/market contracts | Published proofs, bets, claims, payouts; scoped roles/original operator | ELO and human finances | Monad storage outside delegated arena words; no closure workaround. Existing deduplication/correction retained. |
| Historical room/series/authority contracts and one-off qualification/recovery tools | Explicit historical workflows; original operator | Old formats and evidence | Not run. Generic helpers and legacy lifecycle writer also reject v3 closure selectors before signing/broadcast. Historical contracts are not modified. |

`independentWriter` continues observing exact receipts of pending transactions even when the new policy forbids broadcasting that action. `chainTools` likewise may observe a matching already-signed receipt but cannot sign or rebroadcast a v3 close. A policy failure never marks an uncertain transaction reverted or frees its nonce.

Immutable limits: the result tree contains at most 65,536 results per epoch. The existing contract rejects another admission at capacity. Agent per-arena admission gates can exclude that arena. The current human selector has no per-arena exclusion: a blocked eligible idle candidate can block the human admission group. Also, tournament `retryCancelled` requires finality, while a live published root is not final. Resolving these limitations without closure requires a separately reviewed contract change and user approval; none is attempted here. Normal completed matches can publish, capture and reuse the same epoch.

## Evidence so far

New local regressions first failed on age rotation, budget exhaustion and publication silence; after policy changes all 44 lifecycle/role/scoped-writer tests passed. Opening, real cooldown release, exact root sealing, receipt ownership and historical semantics remain tested.

Public baseline Chaos/NOVA match 781, ef9d epoch 9, ended naturally 6–7 after 39.520839 game seconds. Source remains web 39a5b72. There were no contract pauses or resume commands; transport receipt p95 22.395 ms, input-to-receipt p95 33.878 ms, local movement p95 26.5 ms, longest player hold 416.7 ms and spectator hold 266.7 ms. No excessive paddle/ball jumps under the recorded probe's definitions. The original report remains FAILED because its old fixed 50/100-sample minima exceeded the 48 local/95 confirmed samples collected before the natural end. This is one baseline match, not the required nine-match acceptance or a physical authenticator test.

Source diagnosis: `projectLive`/`projectChaos` hold a predicted point until a live event confirms it; Court previously passed that ordinary wait as the same boolean used for an actual stale stream, causing the synchronization overlay. A structured presentation cause now separates points, serves, prediction limits, stale streams, interruptions and contract pause. Authority, clocks and scores remain unchanged.

The command queue/500 ms heartbeat interaction remains a hypothesis pending actual timing evidence. Instrumentation now separates nonce lookup, signature, transport, command queue, permission fence and snapshot hydration. No timeout or contractual credit is increased.

## Preservation

Before changes to services, five databases and runtime configuration were backed up under `/opt/pongit/releases/continuous-20261005/backup-before`, 71,975,999 bytes in six files. All six were copied to `C:/Users/wwwle/.codex/private-backups/pongit/continuous-20261005/backup-before` and SHA-256 verified. Manifest SHA-256: `2d75dbe99997f68660539208146522a3a92cfc54bc518f2af12ac58ae5ceccad`. This copy verification is not a new restore test. Roll back service files/images only; never overwrite newer journals or results with these dumps.
