# Continuous delegation and live synchronization — 5 October 2026

Status: compatible fixes deployed; the nine-match desktop recipe passed on web 8e0c5dc. Earlier failures and limits remain documented below. This is not a 24-hour qualification. No contract deployment or migration occurred. The scheduled task remains paused.

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

Immutable limits: the result tree contains at most 65,536 results per epoch. The existing contract rejects another admission at capacity. Agent per-arena admission gates can exclude that arena. The human selector already skips a full result tree; it lacks an operational per-arena exclusion, so an otherwise eligible idle candidate with an unhealthy node can block the group. Also, tournament `retryCancelled` requires finality, while a live published root is not final. Resolving these limitations without closure requires a separately reviewed contract change and user approval; none is attempted here. Normal completed matches can publish, capture and reuse the same epoch.

## Evidence so far

New local regressions first failed on age rotation, budget exhaustion and publication silence; after policy changes all 44 lifecycle/role/scoped-writer tests passed. Opening, real cooldown release, exact root sealing, receipt ownership and historical semantics remain tested.

Public baseline Chaos/NOVA match 781, ef9d epoch 9, ended naturally 6–7 after 39.520839 game seconds. Source remains web 39a5b72. There were no contract pauses or resume commands; transport receipt p95 22.395 ms, input-to-receipt p95 33.878 ms, local movement p95 26.5 ms, longest player hold 416.7 ms and spectator hold 266.7 ms. No excessive paddle/ball jumps under the recorded probe's definitions. The original report remains FAILED because its old fixed 50/100-sample minima exceeded the 48 local/95 confirmed samples collected before the natural end. This is one baseline match, not the required nine-match acceptance or a physical authenticator test.

Source diagnosis: `projectLive`/`projectChaos` hold a predicted point until a live event confirms it; Court previously passed that ordinary wait as the same boolean used for an actual stale stream, causing the synchronization overlay. A structured presentation cause now separates points, serves, prediction limits, stale streams, interruptions and contract pause. Authority, clocks and scores remain unchanged.

A second natural Chaos/NOVA baseline (match 782, 0a52 epoch 7) injected 200 ms into actual HTTP reads while retaining direct WebSocket sends. It reproduced a 3,115 ms pause and one resume countdown. The old harness incorrectly passed because it omitted the no-pause gate; its original report is retained and a separate failing audit is published. The first gameplay heartbeat began about 206 ms after the first controllable frame, then its first execution took 172 ms. The 500 ms initial credit expired before it reached the engine. The compact sender performed a cold nonce read in the command lane after readiness. The compatible candidate prefetches this read during loading/countdown, shares an in-flight read with the first command, and never prefetches past an uncertain transaction. The exact degraded scenario must pass before claiming this cause fixed. Instrumentation now separates nonce lookup, signature, transport, command queue, permission fence and snapshot hydration. No timeout or contractual credit is increased.

## Preservation

Before changes to services, five databases and runtime configuration were backed up under `/opt/pongit/releases/continuous-20261005/backup-before`, 71,975,999 bytes in six files. All six were copied to `C:/Users/wwwle/.codex/private-backups/pongit/continuous-20261005/backup-before` and SHA-256 verified. Manifest SHA-256: `2d75dbe99997f68660539208146522a3a92cfc54bc518f2af12ac58ae5ceccad`. This copy verification is not a new restore test. Roll back service files/images only; never overwrite newer journals or results with these dumps.

## Compatible service deployment, 12:18 UTC

Commit 7480ecf is mounted in the agent admission/maintenance/archive and human relayer services. No engine was restarted and the human group had no active match before the relayer restart. The deployment report records base image digests and eight source hashes at `/opt/pongit/releases/continuous-20261005/deployment-7480ecf.json`. No contract transaction or closure was submitted. The current no-close policy must remain in place during any service rollback; restoring the former whole configuration would re-enable automatic rotation.

## Delivery, 14:45 UTC

Public web **8e0c5dc** has run since 14:17:55 UTC, image `sha256:363ef561c5d5121e8a54accd171cd300891ed25d1363a0bba5aceddef2dd68f6`. Source archive SHA-256: `1a4af8eee6633a20a9311c6bd085265b7b70b9660b1dfbbc187e07fb3491a126`. The no-close services retain **7480ecf/5d85044**. [Runtime inventory](continuous-runtime-20261005.json) records exact image bases, mounted source hashes and configuration hashes. No contract redeployment, migration, new closure or engine restart was performed. The older full-release/24-hour scope remains unqualified.

Five natural Chaos/NOVA matches **829, 831–834**, two natural Classic/NOVA matches **835–836**, and two natural PvP Chaos games **contpvp9/contpvp10** passed on this same web build. All ended through score, not concession. Chrome and Edge used separate player/observer contexts, the actual public catalogue/API, Mera SDK and live node commands. PRF authenticators were virtual. The PvP spectator placed a real test-MON bet then disconnected deliberately; both players continued observing each other. Continuous coverage by that disconnected third context is not claimed.

| Measurement | Final per-match p95 / maximum |
| --- | --- |
| Local movement, agents | p95 22.3–24.5 ms |
| Local movement, PvP | p95 29.8–38.4 ms |
| Send to executed receipt, agents | p95 13.665–15.443 ms |
| Send to independent observer control, agents | p95 7.414–10.192 ms |
| Send to executed receipt, PvP | p95 18.165–18.311 ms |
| Send to other player control, PvP | p95 15.573–16.607 ms |
| Frame interval | p95 17.0–17.1 ms |
| Longest hold, agents including observer | 266.9 ms |
| Longest hold, PvP | 50.2 ms |
| Startup/contract pauses, visible resyncs, unexpected resumes | 0 in the nine accepted matches |
| -32005, NodeBusy or rejected commands | 0 in the nine accepted matches |
| Peak sampled pending diffs | 28; not a worst-case storage proof |
| Peak commands per signer per second | 8 |

The common Playwright host aligns sender and receiver clocks. The probe records actual paint time separately from animation-frame time. Agent queue p95 was 0.3–0.6 ms, signing 0.4 ms, cached fence at most 0.1 ms and receipt hydration 0.6–0.8 ms. Sampled node health advanced about 96.86–98.81 blocks/second over each whole observation window. Cached health and integer timestamps make that a coarse clock measurement, not exact countdown/pause phase timing. Each player fixture opened two engine WebSockets (send and stream), with zero observed closures. Observation calls, connections and visible interruptions have distinct counters; observation calls do not equal full RPC reads. Production nodes were not deliberately overloaded.

[Acceptance JSON](continuous-acceptance-20261005.json) contains references, report hashes, latency, prediction errors, connection counts and failed-attempt ledger. Fresh-account admissions took **10.835–13.573 seconds**, including authorization: the separate earlier eight-second valid-session target is not proven. There is no admission-speed or full-release claim here.

### Demonstrated causes and fixes

1. **Startup pause:** the cold gameplay nonce read consumed the immutable 500 ms presence credit. In the same 200 ms read-delay scenario, baseline 782 paused for **3,115 ms**; 788 after prefetch completed with **zero** pause/resume/resync, local p95 21.7 ms and observer p95 11.94 ms. The prefetch is read-only, during loading/countdown, and retains one nonce owner and exact uncertain receipt handling. No contract timeout was increased.
2. **Point synchronization:** predicted-goal and initial launch-buffer waits shared the stale-stream boolean. Structured causes distinguish point, serve, draw, starting, stale, interrupted and contractual pause. Ordinary points retain court, clock and session. Startup 799's 50 ms false overlay remains a failed report; the later accepted series has none.
3. **Paddle resistance:** a predicted point returned before applying a later local intention. 8a5ed5f continues only paddle presentation within the existing bounded window; ball, score, physics time and effects stay at the authority fence. Four missed input responses in contpvp6 reproduced that boundary; none occur in the accepted PvP pair. Human queued control and local intention now use the same physics timeline. The contract's latest-per-side Pending semantics remain intact.
4. **Visible rollback:** paddle reconciliation dragged a ball that had already missed, including one far above the paddle. contpvp5 exposed a **99-pixel** jump; contpvp8 exposed **30.8–39.9 pixels**. c73360e separated correction outside the paddle plane; 8e0c5dc additionally limits correction to actual contact or the minimum needed to preserve an otherwise obscured miss. Recorded cases pass two-sided regressions. Smoothing duration and contract collisions did not change. Final PvP has no detected ball/paddle discontinuity.

Intermediate passing seven-agent series on 58c3aca, c73360e and 8a5ed5f did not substitute for the final 8e0c5dc series. The original failed reports were not rewritten. A source-only duplicate human-send prevention was also implemented, but no adjacent duplicate direction was observed in the failed PvP; it is not claimed as the measured cause. The earlier contpvp1 node -32603 state-read failure is retained and is not claimed fixed by a rendering patch.

### Failure preservation and separate faults

One additional final-build Chaos attempt, **830**, remains **FAILED** by the strict all-receipts-success gate: a heartbeat reverted as the natural seventh point arrived. There was zero pause/resync and a published natural 4–7 result. [Terminal timing and journal hash](continuous-terminal-race-20261005.json) preserve the failure. The revert selector could not be recovered afterward; it is not labelled a successful command. Separate match 831 passed unchanged strict gates. Across the investigation, **12 failed browser attempts** remain in the ledger, including four reused-virtual-credential revocation timeouts and earlier render defects.

Separate natural public fixtures passed **F5, offline/WebSocket loss, loss of a successful movement response, and owner revocation/renewal**. A true disconnect froze both score and physics before recovery. The lost response kept the exact nonce and receipt; no replacement was signed. Fresh-account revocation produced actual revokeActive, renewActive and resumeReady receipts; it does not prove the previously timed-out reused virtual credential or a physical authenticator.

Delayed publication has a controlled regression: 60 successful live inputs over 30 seconds at unchanged Monad batch, then continued input after the batch advances. No production publisher was stopped. The fault fixtures use the same unchanged control layer, before the final narrow rendering patches. Normal-match no-pause gates are not applied to deliberately disconnected fixtures.

### Canonical results, finances and preserved limits

At Monad block **68426609**, [canonical audit](continuous-canonical-20261005.json) matched **47 completed agent results** to the actual pool `result` storage at a fixed block/hash. Every captured result remains in its same **active epoch**. Seven agent and three human arenas are active with `expiresAt=0`; e54e was already released from a closure predating this intervention. **Published remains contestable**, not final.

Actual current terms still differ from the [official deployment table](https://github.com/Veenoway/interlude-sdk/blob/main/docs/DEPLOYMENTS.md): stake **10 MON**, challenge bond **100 MON**, resolution **900 seconds**. Fee 0.01 MON, challenge window 3600 seconds, unlimited lease duration and hub ceiling 256 agree. npm still reports SDK **0.2.2**; no unnecessary dependency upgrade was made. Production Node is **24.21.0**, excluding the pre-22 missing-WebSocket case.

Four read-only financial audits verified canonical pre-claim amounts, exact receipt/balance increases and rejected duplicate claim/retry: **three 0.006 MON winning payouts**, plus a separately labelled **0.00385067643389543 MON refund**. The latest disconnected winner received `0xbb5830b77325e9b54f6788c534c10fb15647ff078a6157711b3184f4779186fa`. No finance contract or payment semantics changed.

Reviewed reserve remains **maxBatches=16000 / matchReserveBatches=8000**. It was not raised silently. Exhaustion suspends affected new admissions instead of closing an arena. The immutable 65,536-result tree, human operational exclusion and cancelled-tournament finality constraints listed above remain. Any redesign requires separately approved contracts and migration preserving old results, claims, identities and real games. This delivery does not authorize that migration.

### Verification, preservation and rollback

- Latest focused tests **132/132 pass**; root TypeScript passes. Last full run **1020/1021**: the local generated ContinuingAgentRatings artifact differs from its reviewed fingerprint. The safety pin was not weakened. No Solidity/ABI changed, and this is not an entirely green full-suite claim.
- Post-test backup: five databases plus configurations/journals, **72,486,177 bytes**, six files SHA-verified off VPS. Manifest **503fb47c3460ad5be7e80acd298e0e953dffd6b9a07962d29267ebbfeeed2fd3**. [Backup record](continuous-backup-20261005.json). Copy verification is not a new database restore test.
- Browser evidence: **500 files / 714,213,881 bytes**, including failures, screenshots and videos, copied and SHA-verified outside the worktree. Manifest **3ee78ae3bef59f173985023d01bf754eaa64684a3b8ba289752fc33afb5de1c3**. [Evidence copy](continuous-browser-backup-20261005.json).
- Scoped build cleanup copied old reproducible build sources off VPS with hashes before deletion. Runtime/rollback images, volumes, personal files, old balances and all journals remain intact. Unsupported Docker --cpus build attempt failed before compilation; the recorded CPU-quota retry passed.
- Rollback **web/service code only**, retaining the no-close guard and newer journals/databases. Previous web image: `sha256:ed073e471c2a517d26b95e457274e8d0c0d50c2f06a6e05c5a7491a44e628754`; its known distant-ball defect makes a forward fix preferable. Never restore the former age-rotation configuration or overwrite current transactions with backup dumps.
- Automation remains **PAUSED**. All browser/game qualification drivers have exited. No lifecycle helper was started.

Manual checks remaining: physical passkey login/revocation and actual mobile/touch feel on the user's network. No unchanged 24-hour soak, mobile GPU, physical authenticator or worst-case publication reserve is claimed by these nine desktop matches.
