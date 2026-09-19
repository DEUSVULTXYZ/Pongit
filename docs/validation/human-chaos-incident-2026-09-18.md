# Human Chaos freeze and publication halt, 18 September 2026

Branch `fix/human-chaos-recovery`. It continues `fix/human-chaos-interim` (`db74546`), which starts from release `853f174`. There is no contract change and no redeployment.

Nothing here has been deployed, and no transaction has been sent. Production observations come from read-only checks on 19 September 2026 at 09:15 UTC.

## What happened

| Time (UTC) | Event |
| --- | --- |
| 18 Sep, 19:41:00 | The hub commits batch 190, the last batch of epoch 6. It publishes match `15508105729549036396166434651117196823296587055133484651289937508406096101523` as live: phase 2, revision 289, 81.54 s, score 4-6. |
| About 19:41 | The match freezes. A heavy force-grid effect is running, and one 15 M-gas `tick` cannot simulate the gap. |
| 19:41 to 20:11 | About 1,350 commands revert in 29 minutes: the relayer's maintenance loop every 2 s, plus the players' browsers. None changes state, so no batch is sealed. |
| 20:11:04 | The contract's 30-minute rule cancels the match on the node (phase 4). The cancel's state changes go into batch 191. |
| About 20:11 | The hosted relay refuses batch 191: `commit relay failed: 502 Bad Gateway: {"error":"commit failed: Missing or invalid parameters."}`. The node halts with 12 pending diffs and refuses every transaction. |
| From 20:11 | `/api/interlude/config` keeps reporting `online:true`. |
| 19 Sep, 03:53:12 | The epoch-6 delegation expires. The lifecycle stays in `draining` with "Delegation expired with unfinished engine state; operator publication recovery is required before renewal". |

State at 09:15 UTC on 19 September:

- **Node** `https://il-78d3341e3452d7ec.fly.dev`, epoch 6. `/health` reports `halted` ("batch 191 could not be settled (...); refusing further transactions...") with 12 pending diffs.
- **Hub** `0x3Ef8327F69e09cf721772F345e2A887eA22cD595`, app `0x78d3341e3452d7ec1add9371de3008639eed8eb0`: status 1 (active), epoch 6, batch index 190, last commit 19:41:00, expiry 03:53:12, maximum batch interval 3,600 s. The hub's liveness escape, `forceClose`, is open.
- **Frozen match.** `il_results` holds it as mode 1, phase 4, which is the node's cancel. Monad still publishes it as phase 2 with no result hash, and the published `activeCount` is 1.

## What our software got wrong

1. **The halt was invisible.** The relayer read only `interlude_session`, which has no halt field; `/health` and refused sends show the halt, and it read neither. The only live match had just been cancelled, so no command was sent after the halt, and no refusal ever reached the relayer. It kept reporting the arena online and admitting players.
2. **A refused command wedged its journal.**
   - **Relayer.** A command the node refuses before execution stayed pending in `il_engine_jobs`. The relayer resent the same bytes forever, and every later relayer command waited behind it.
   - **Browser.** The browser journal did the same for a player.
   - A halted node refuses everything, so any command sent during the halt would have wedged its signer.
3. **The renewal deadlocked.** After a `forceClose`, the lifecycle's finalizing pass submits `finalizeResult` for every terminal Chaos row of `il_results`, in order, before `renewEngine`. The adapter accepts only a result that Monad publishes as terminal. The frozen match is terminal only on the halted node, so its simulation fails forever and the pass never reaches `renewEngine`. `beforeRenew` has the same wait for any match with bettors. Yet the match can only end in epoch 7, which needs that renewal.
4. **A stale row and a disappearing room.**
   - **The stale row.** The phase-4 row was corrected only when the result audit reached it. That audit rotates two rows every 15 s through every result.
   - **The room.** A room was deleted 48 hours after its last activity. The audit restores a resumed match only into an existing room. Without the room nothing ticks the resumed match, and the next renewal waits on its active match forever.
5. **An old epoch's pending command blocked the next epoch.** At release, the lifecycle marked only quarantined commands as obsolete. A pending epoch-6 command would stop every relayer command of epoch 7 ("from another delegation").
6. **The resume would freeze again.** Epoch 7's node starts from Monad's published state, so the match resumes at 81.54 s in the same grid state. The release relayer signs 15 M commands and its maintenance loop ticks only after 1.5 s without progress. A grid state cannot keep moving at that pace, so the match would freeze again and repeat the incident.

## What this branch changes

### Interim, unchanged from `fix/human-chaos-interim`

- **30,000,000 gas on every game-node command.** This covers the relayer's `tick`, `cancelMatch`, `submitPressure`, `submitLivePressure` and `submitRandomness`, and every browser compact control (`shared/engine-gas.ts`). Gas is free on this chain; the limit is a ceiling.
- **Relayer guard.** `relayer/src/chaos-tick-guard.ts` ticks a live rules-6 Chaos match after 500 ms without observed progress. It uses the existing `publicTick` journal and single writer.
- **One round trip less.** A command signed in the same call skips its receipt lookup before its first send.

### Halt detection (`077d557`)

- **Relayer.** The maintenance loop reads `/health` beside `interlude_session`, with a 2.5 s timeout (`shared/engine-halt.ts`, `relayer/src/rooms-engine-halt.ts`).
  - **What marks a halt.** A `halted` report does. So does a send refused with "this session is over and the node is no longer accepting transactions". The node is then unavailable:
    - `online` and `admission` are false;
    - `errorCode` is `ENGINE_HALTED`, with a message for players;
    - no new match, tick, cancel, beacon or checkpoint is signed;
    - the guard stops.
  - **What never does.** A failed, slow or unreadable health read changes nothing, either way.
  - **What clears it.** An explicit healthy report, or a new epoch.
  - **Operator status.** The coordinator's status includes `halt` (reason, source, epoch, since); `/api/health` serves it as `game` when no independent arena is configured. The logs record `rooms-engine-halted` and `rooms-engine-halt-cleared`.
- **Browser.** The browser shows the halt message from the config and the lobby. While the halt lasts, writes stay blocked and nothing is resent to the node; the check repeats every 30 s. This extends the existing publication-unavailable path.

### Refused commands (`077d557`)

This is the agent arcade's writer rule (`8a9f17b`), applied to the rooms journal (`relayer/src/rooms-engine-recovery.ts`) and to the browser journal (`web/lib/rooms-command-journal.ts`).

- **When a command is retired.** Only when both conditions hold:
  - the node's own error says it refused the command before execution: the gas cap, "rejected before execution", or a halted node;
  - the node's latest transaction count for the signer equals the command's nonce.
- **When it stays pending.** In every other case:
  - a lost response or a timeout;
  - a local cooldown or publication gate, which carry no node refusal;
  - a count that moved or could not be read.

  Only the command's own bytes are ever resent.
- **Where a retired command goes.**
  - A relayer command moves from `il_engine_jobs` to the new table `il_engine_refusals`, with its bytes and the node's reason. It has to leave: the unique `(app, epoch, nonce)` index must admit the next command at the same nonce. The log records `rooms-engine-command-refused`.
  - A browser entry is kept as `refused` and can never be sent again. The tab then signs its next command at the freed nonce.
  - After a halt refusal, the tab shows the halt instead of signing again.
- **A node halted for good.** It may not answer the count, so its pending command stays pending. That is safe:
  - Nothing on the `forceClose` path waits on it.
  - Once the hub has released the epoch, the lifecycle marks the epoch's pending and quarantined commands obsolete, before renewal. The bytes stay in the journal.
  - The relayer does the same whenever the hub and the node serve a later active epoch, which also covers a renewal made outside the lifecycle.

### Renewal past an unpublished result (`cbdf503`)

- **Finalizing pass.** `relayer/src/rooms-finalization.ts` reads on Monad what the adapter's `finalizeResult` checks:
  - a published phase of 3 or 4, with a result hash;
  - `matchEpoch` above zero, for early settlement;
  - `finishedAt` at or before the Monad block time, for realtime betting.
- **Verdicts.**
  - A result that fails the publication check is deferred, not submitted. The same applies when no market round was ever opened: the adapter can never accept that result, and nobody could bet on it.
  - A finish time a few seconds ahead of Monad makes the pass wait instead.
  - A read failure stops the pass, as before.
- **`beforeRenew`** follows the same rule for matches with bettors.
- **Logs.** A deferred set is logged once, as `rooms-lifecycle-finalization-deferred` and `rooms-finance-capture-deferred`. A later pass finalizes it once it is published.
- **`il_results`.**
  - **Audit.** Every result audit checks unpublished rows first. In epoch 7 the frozen match's live hash is zero, which differs from the stale phase-4 row. Within one audit, the match is restored into its room and the row deleted. Its real end is recorded when it comes.
  - **Rooms.** A room whose recorded result is not yet published is no longer deleted.

### Guard fixes (`7da0e98`)

- **Revert scoping.** A guard tick can resolve the journal's pending entry of another match. When that entry had reverted, the guard used to back off its own match. That entry is now reported as reconciled, whatever its outcome, and each tick outcome is recorded under the match of the command that executed.
- **Silent on a frozen match.** After any relayer tick of a match has reverted with no progress since, the guard stays silent for that match. It resumes when progress is observed, or when one of its ticks succeeds, as after a node restart that re-anchors the clock. The fixed 5 s revert backoff is gone. Before, the guard followed each of the maintenance loop's reverts with 29 M reverts of its own for the whole freeze.
- **Worst state.** Tolerances and timing claims now use the worst measured state, both balls inside the gravity well (`CHAOS_WORST_GAP_TOLERANCE_MS`), not the wind.

## Measured tolerance

These are Forge measurements against the production `PongChaosEvents` class (`contracts/test/HumanChaosTickGas.t.sol`), with cold storage and a 10 ms engine-block resolution. The budgets are the command gas minus intrinsic gas and calldata: 14,978,424 at 15 M and 29,978,424 at 30 M for `tick`.

| Grid state | Largest gap at 15 M | Largest gap at 30 M |
| --- | ---: | ---: |
| Wind, one ball | 730 ms | 1,410 ms |
| Curve shot in flight | 700 ms (at 14.8 M) | 1,350 ms |
| Wind, two balls (effect 21) | 610 ms | 1,140 ms |
| Gravity well, one ball inside | 680 ms (at 14.8 M) | 1.2 s fits (26.6 M); no failing gap in this fixture |
| **Gravity well, both balls inside** | **540 ms** | **1,030 ms** |
| `input` from the backup, wind | not measured | 1,410 ms, same as `tick` |

- **A frozen match does not thaw.** A 5 to 60 s wind gap needs 100 to 103 M gas, and the flow's own step budget caps it there. At 30 M such a match stays frozen until the 30-minute cancel.
- **Cost of a revert.** A reverted 30 M tick consumes 28,974,537 gas of node execution.

Here is what the worst state means in practice. Round trips are node round trips; the VPS measured 120 ms at p50 and up to 300 ms at p99.

- **Healthy primary.** Its gap is 300 ms plus one round trip. It fits up to a round trip of about 730 ms.
- **Relayer guard.** Its gap is 600 ms plus two round trips: 840 ms at the p50. It fits both balls in the well up to a 215 ms round trip, two balls in the wind up to 270 ms, and one ball in the wind up to 405 ms.
- **Browser backup.** Its 900 ms takeover plus two round trips is 1,140 ms at the p50. That fits one ball in the wind and the curve shot, but not both balls in the well.

## Recovery procedure

None of these steps has been carried out. Every Monad transaction below is the operator's decision.

1. **Deploy this branch first**, relayer and web, after review. It must be running before `renewEngine`, for two reasons:
   - the release relayer's finalizing pass deadlocks on the frozen match;
   - its 15 M maintenance loop would freeze the resumed match again.

   Deploying before the `forceClose` also shows players the halt instead of `online:true`, and nothing new is signed for the halted node. After deployment:
   - `/api/interlude/config` should report `online:false` and `errorCode:"ENGINE_HALTED"` (`ENGINE_RENEWING` once the lifecycle moves on);
   - the relayer log should show `rooms-engine-halted`.

   The new table `il_engine_refusals` is additive.
2. **Read-only checks before the `forceClose`.**
   - Hub `sessionOf(app, 0x0)`: status 1, epoch 6, batch index 190, and the current time past `lastCommitAt` plus `maxBatchInterval`.
   - `SELECT status, count(*) FROM il_engine_jobs WHERE app = '0x78d3341e3452d7ec1add9371de3008639eed8eb0' GROUP BY status`. Any pending command becomes obsolete at release.
   - `SELECT id, phase, published FROM il_results WHERE app = '0x78d3341e3452d7ec1add9371de3008639eed8eb0' AND NOT published`. Expect the frozen match: phase 4, not published.
   - `SELECT count(*) FROM il_bettors WHERE id = '15508105729549036396166434651117196823296587055133484651289937508406096101523'`. Its bettors are paid only after epoch 7; see step 5.
3. **Force the close.** Anyone may call `forceClose(0x78d3341e3452d7ec1add9371de3008639eed8eb0, 0x0000000000000000000000000000000000000000000000000000000000000000)` on the hub. The lifecycle then moves by itself:
   1. `challenge` (hub status 2) until `stakeUnlockAt`;
   2. `releaseStake`;
   3. `finalizing`: epoch-6 pending and quarantined commands become obsolete, the published results are finalized, and the frozen match is deferred (`rooms-lifecycle-finalization-deferred`, plus `rooms-finance-capture-deferred` if it has bettors);
   4. `renewEngine`, then the hosted renewal request for epoch 7.
4. **Epoch 7 starts.** The lifecycle stays in `starting` until the node reports epoch 7 and the hub's batch index.
   - **Restore.** The result audit sees the frozen match live again and restores it into its room; the stale row is deleted.
   - **First command.** A node whose block counter starts below the published anchor re-anchors the clock on the first command, which simulates nothing (`testResumedGridMatchNeedsTheGuardCadence`). A counter far enough above the anchor to put the match clock past 30 minutes makes the first command cancel the match instead, again without simulating. Only a counter slightly above the anchor would face a large gap and freeze until the cancel.
   - **Play.** Once the lifecycle reaches `playing`, the guard ticks the match about every 0.6 to 0.84 s. Its players have probably left, so it plays on alone until one side reaches 7.
   - **Gas-cap check.** Watch the log for `rooms-engine-command-refused` with "gas limit is greater than the cap". It would mean this node refuses 30 M commands. Each refused command is retired and the journal stays free, but no match can advance. Close admission (`ROOMS_ADMISSION_ENABLED=false`) and bring `ENGINE_COMMAND_GAS` back to 15 M before reopening. At 15 M even the guard's 840 ms cannot keep a grid state moving (540 to 730 ms), so a resumed grid match can freeze again until its 30-minute cancel.
5. **Afterwards.**
   - **Result.** The match's end is recorded, and the recorded result becomes published.
   - **Bettors.** Its `matchEpoch` stays 6, and while epoch 7 is active the adapter refuses to finalize it ("match epoch changed"). Its bettors are therefore paid in the finalizing pass at the end of epoch 7.
   - **Paddles.** Bets placed during the freeze cannot change its paddles in epoch 7 either. Live pressure is signed for epoch 6, which the node rejects before any simulation.

## What it still does not cover

- **30 M acceptance on this node.** Nobody has observed this node accept a 30 M command. The agent arcade's newer nodes accept exactly 30,000,000 from its coordinator.
- **Maintenance-loop retries during a freeze.** The loop still retries a frozen match every 2 s, at up to 29 M gas each, until the 30-minute cancel. The browsers retry every 1 to 2 s. The guard no longer adds to this.
- **Batch 191 itself.** The relay's refusal ("commit failed: Missing or invalid parameters.") belongs to Interlude's commit relay. Nothing on our side explains it, and nothing links it to the reverted commands.
- **The interim's remaining limits:**
  - a `Retry-After` (429) that applies to every sender;
  - a node restart that keeps its block counter;
  - network partitions longer than the tolerance, a disconnected stream or a stopped relayer;
  - relayer round trips above 215 ms in the worst state;
  - the browser backup, which cannot rescue the worst state.
- **Complete fix.** Gas-bounded slicing inside `ChaosGameFlow.advance` needs a new library, root app, finance bindings, hosted engine and delegation.

## Checks

- `tsc --noEmit -p .` passed.
- `tsx --test tests/*.test.ts` passed 233 of 233. That is 211 before this branch, plus 22 new tests:
  - halt detection: `tests/engine-halt.test.ts`;
  - refusal retirement and epoch release: `tests/rooms-engine-recovery.test.ts` and `tests/rooms-command-journal.test.ts`;
  - finalization skip: `tests/rooms-finalization.test.ts`;
  - guard backoff scoping, the frozen rule and the worst-state budget: `tests/chaos-tick-guard.test.ts`.
- `forge test --root contracts --match-path test/HumanChaosTickGas.t.sol` passed 13 of 13: 7 release reproductions at 15 M and 6 interim measurements at 30 M. Two of the 30 M measurements are new: both balls in the well, and the resumed match.
- **Not run.** No live node, browser, relayer or database run, no deployment and no transaction.
