# Human Chaos freeze and publication halt, 18 September 2026

Branch `fix/human-chaos-recovery-r2`. It continues `fix/human-chaos-recovery` (`cbf1dbe`) with the fixes of its first review, which continues `fix/human-chaos-interim` (`db74546`), which starts from release `853f174`. There is no contract change and no redeployment.

Nothing here has been deployed, and no transaction has been sent. Production observations come from read-only checks on 19 September 2026 at 09:15 UTC, and at 10:55 UTC for the second review.

## What happened

| Time (UTC) | Event |
| --- | --- |
| 18 Sep, 19:41:00 | The hub commits batch 190, the last batch of epoch 6. It publishes match `15508105729549036396166434651117196823296587055133484651289937508406096101523` as live: phase 2, revision 289, 81.54 s, score 4-6. (See the note on this id under the state at 10:55.) |
| About 19:41 | The match freezes. A heavy force-grid effect is running, and one 15 M-gas `tick` cannot simulate the gap. |
| 19:41 to 20:11 | About 1,350 commands revert in 29 minutes: the relayer's maintenance loop every 2 s, plus the players' browsers. None changes state, so no batch is sealed. |
| 20:11:04 | The contract's 30-minute rule cancels the match on the node (phase 4). The cancel's state changes go into batch 191. |
| About 20:11 | The hosted relay refuses batch 191: `commit relay failed: 502 Bad Gateway: {"error":"commit failed: Missing or invalid parameters."}`. The node halts with 12 pending diffs and refuses every transaction. |
| From 20:11 | `/api/interlude/config` keeps reporting `online:true`. |
| 19 Sep, 03:53:12 | The epoch-6 delegation expires. The lifecycle stays in `draining` with "Delegation expired with unfinished engine state; operator publication recovery is required before renewal". |
| 19 Sep, about 20:11 | The running release deletes the match's room: a room that is not `active` is closed and deleted 24 hours after its last activity (`interlude-rooms.ts` in `853f174`), whatever its result's state. |

State at 09:15 UTC on 19 September:

- **Node** `https://il-78d3341e3452d7ec.fly.dev`, epoch 6. `/health` reports `halted` ("batch 191 could not be settled (...); refusing further transactions...") with 12 pending diffs.
- **Hub** `0x3Ef8327F69e09cf721772F345e2A887eA22cD595`, app `0x78d3341e3452d7ec1add9371de3008639eed8eb0`: status 1 (active), epoch 6, batch index 190, last commit 19:41:00, expiry 03:53:12, maximum batch interval 3,600 s. The hub's liveness escape, `forceClose`, is open.
- **Frozen match.** `il_results` holds it as mode 1, phase 4, which is the node's cancel. Monad still publishes it as phase 2 with no result hash, and the published `activeCount` is 1.

State at 10:55 UTC on 19 September (read-only `eth_call`s on Monad and on the halted node):

- **Hub.** Unchanged: status 1, epoch 6, batch index 190, expiry 03:53:12. Nobody has called `forceClose`.
- **Monad.** `activeCount` is 1.
- **The id above does not match.** `getSnapshot`, `chaosState`, `matchMode` and `gameEpoch` for that id all read zero, on Monad and on the node, while Monad's `activeCount` is 1. The id as written here is probably mis-transcribed. Take the frozen match's id from `il_results` (step 2 of the recovery), and read its published beacon request before the `forceClose` (same step).

## What our software got wrong

1. **The halt was invisible.** The relayer read only `interlude_session`, which has no halt field; `/health` and refused sends show the halt, and it read neither. The only live match had just been cancelled, so no command was sent after the halt, and no refusal ever reached the relayer. It kept reporting the arena online and admitting players.
2. **A refused command wedged its journal.**
   - **Relayer.** A command the node refuses before execution stayed pending in `il_engine_jobs`. The relayer resent the same bytes forever, and every later relayer command waited behind it.
   - **Browser.** The browser journal did the same for a player.
   - A halted node refuses everything, so any command sent during the halt would have wedged its signer.
3. **The renewal deadlocked.** After a `forceClose`, the lifecycle's finalizing pass submits `finalizeResult` for every terminal Chaos row of `il_results`, in order, before `renewEngine`. The adapter accepts only a result that Monad publishes as terminal. The frozen match is terminal only on the halted node, so its simulation fails forever and the pass never reaches `renewEngine`. `beforeRenew` has the same wait for any match with bettors. Yet the match can only end in epoch 7, which needs that renewal.
4. **A stale row and a disappearing room.**
   - **The stale row.** The phase-4 row was corrected only when the result audit reached it. That audit rotates two rows every 15 s through every result.
   - **The room.** A room was deleted 24 hours after its last activity. The audit restores a resumed match only into an existing room. Without the room nothing ticks the resumed match, and the next renewal waits on its active match forever.
5. **An old epoch's pending command blocked the next epoch.** At release, the lifecycle marked only quarantined commands as obsolete. A pending epoch-6 command would stop every relayer command of epoch 7 ("from another delegation").
6. **The resume would freeze again.** Epoch 7's node starts from Monad's published state, so the match resumes at 81.54 s in the same grid state. The release relayer signs 15 M commands and its maintenance loop ticks only after 1.5 s without progress. A grid state cannot keep moving at that pace, so the match would freeze again and repeat the incident.

## What `fix/human-chaos-recovery` changed

### Interim, unchanged from `fix/human-chaos-interim`

- **30,000,000 gas on every game-node command.** This covers the relayer's `tick`, `cancelMatch`, `submitPressure`, `submitLivePressure` and `submitRandomness`, and every browser compact control (`shared/engine-gas.ts`). Gas is free on this chain; the limit is a ceiling. The second review makes it configurable (below).
- **Relayer guard.** `relayer/src/chaos-tick-guard.ts` ticks a live rules-6 Chaos match after 500 ms without observed progress. It uses the existing `publicTick` journal and single writer.
- **One round trip less.** A command signed in the same call skips its receipt lookup before its first send.

### Halt detection (`077d557`)

- **Relayer.** The relayer reads the node's `/health` (`shared/engine-halt.ts`, `relayer/src/rooms-engine-halt.ts`). The second review moves this read out of the maintenance loop (below).
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

This is the agent arcade's writer rule (`8a9f17b`), applied to the rooms journal (`relayer/src/rooms-engine-recovery.ts`) and to the browser journal (`web/lib/rooms-command-journal.ts`). The second review narrows which refusals count.

- **When a command is retired.** Only when both conditions hold:
  - the node's own error is the gas cap ("transaction gas limit is greater than the cap") or a halted node ("this session is over and the node is no longer accepting transactions");
  - the node's latest transaction count for the signer equals the command's nonce.
- **When it stays pending.** In every other case:
  - the generic "rejected before execution" on its own;
  - a lost response or a timeout;
  - a local cooldown or publication gate, which carry no node refusal;
  - a count that moved or could not be read.

  Only the command's own bytes are ever resent.
- **Where a retired command goes.**
  - A relayer command moves from `il_engine_jobs` to the new table `il_engine_refusals`, with its bytes and the node's reason. It has to leave: the unique `(app, epoch, nonce)` index must admit the next command at the same nonce. The log records `rooms-engine-command-refused`.
  - A browser entry is kept as `refused`. The tab then signs its next command at the freed nonce, and it may be byte-identical (second review).
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
  - Read failures: see the second review.
- **`beforeRenew`** follows the same rule for matches with bettors.
- **Logs.** A deferred set is logged once, as `rooms-lifecycle-finalization-deferred` and `rooms-finance-capture-deferred`. A later pass finalizes it once it is published.
- **`il_results`.**
  - **Audit.** Every result audit checks unpublished rows first. In epoch 7 the frozen match's live hash is zero, which differs from the stale phase-4 row, so the audit restores it within one audit (second review for the details).
  - **Rooms.** A room whose recorded result is not yet published is no longer deleted.

### Guard fixes (`7da0e98`)

- **Revert scoping.** A guard tick can resolve the journal's pending entry of another match. When that entry had reverted, the guard used to back off its own match. That entry is now reported as reconciled, whatever its outcome, and each tick outcome is recorded under the match of the command that executed.
- **Silent on a frozen match.** After any relayer tick of a match has reverted with no progress since, the guard stays silent for that match. It resumes when progress is observed, or when one of its ticks succeeds, as after a node restart that re-anchors the clock.
- **Worst state.** Tolerances and timing claims now use the worst measured state, both balls inside the gravity well (`CHAOS_WORST_GAP_TOLERANCE_MS`), not the wind.

## What the second review changed (`fix/human-chaos-recovery-r2`)

1. **The orphaned match (high, time-sensitive).**
   - **The defect.** The running release deletes the match's room about 24 hours after 20:11 on 18 September, so the room may be gone before this branch is deployed. `restoreContestedMatch` then returned silently, the audit deleted the stale row anyway, and nothing watched the match: it would have stayed active on Monad for good, with both players `ArenaBusy` and every drain blocked.
   - **Now** (`relayer/src/rooms-restore.ts`). The row is deleted only once the match is back in a lobby room:
     - If the room exists, the match is restored into it, as before.
     - If the room is gone, it is recreated under the same id from the signed offer kept in `il_offers`, with the two players as members (`rooms-match-room-recreated`). The maintenance loop then watches and ticks it from that room.
     - If no signed offer is on record, or the room holds another unfinished match, or it would exceed eight members, the row is kept, the operator is alerted once (`rooms-match-orphaned`, `console.error`), and the relayer still watches and ticks the match by id, guard included, until it ends. Its end is then recorded against the row's room. The lifecycle can drain once it has ended, and its finalizing pass defers the unpublished row meanwhile. The coordinator's status lists such matches under `orphans` (match ids only: a room id is an invitation link).
     - A match the node ended differently from its row is recorded again from the node (the row is updated in place, never deleted). A match the node does not know keeps its row and is reported once (`rooms-result-unknown-to-node`).
   - A failure while restoring one row no longer stops the audit of the others.
2. **Commands bound to the closed epoch (medium-high)** (`relayer/src/rooms-command-epoch.ts`).
   - **The defect.** The resumed match keeps its epoch-6 beacon request and its epoch-6 market round. `verifyRandomness` requires the request's epoch to be the hub's current one, and `checkPressure` requires `LivePressure.epoch` to be. Both commands would have been offered every 2 s, held the single writer and marked the match in flight, so the guard's tick waited past the 1,030 ms worst-state tolerance and the match froze again.
   - **Now.** A `submitRandomness` or `submitLivePressure` whose epoch is not the node's current one is refused before it is queued: it is never signed, never occupies the writer and never counts as in flight. The maintenance loop does not even offer such a beacon request to the pump (`rooms-chaos-draws-suspended`, once per match and epoch), and live pressure for a round of another epoch is skipped before any Monad read (`rooms-chaos-pressure-suspended`, once).
   - **What it means for Chaos draws.** `advance` files a new request only while field 29 is empty, and `announce` refiles one only after applying a proven draw. So:
     - if the request was still pending when epoch 6 closed (no proven draw in field 30), the match gets **no new Chaos draw for the rest of its life** in epoch 7. It keeps playing; effects already announced still expire;
     - if the draw had already been proven, it is announced on schedule in epoch 7, and the next request carries epoch 7, so draws continue.

     Both cases are measured by `HumanChaosRenewedEpochTest` in `contracts/test/HumanChaosTickGas.t.sol`. Which one applies to the frozen match depends on its published field 30; see the check in step 2 below.
   - **Paddles.** Pressure bought during the freeze cannot change its paddles in epoch 7, as before; now nothing is attempted.
3. **A gas-cap refusal leaves the site online (medium).**
   - **Now.** A refusal "transaction gas limit is greater than the cap" makes the node unavailable: `online` and `admission` false, `errorCode` `ENGINE_GAS_CAP`, a player message, the guard stopped, nothing new signed (`rooms-engine-gas-cap`). It holds for the epoch in which it was seen; a new epoch, or a relayer restarted with a lower limit, decides again. A journaled command signed above the current limit is only retired; it says nothing about the current limit.
   - **Configurable limit.** `ROOMS_ENGINE_COMMAND_GAS` (whole number from 1,000,000 to 30,000,000; empty means 30,000,000; anything else stops startup) sets every relayer command's limit. `/api/interlude/config` serves it as `commandGas`, and an open tab signs its next control with it, without a reload. `compose.yaml` passes it to the relayer container and `.env.example` documents it.
   - **Browser.** A tab whose recovery resend meets the gas cap waits for a lower limit (`ENGINE_GAS_CAP` message) instead of signing the same one again, and signs at once when the served limit is already lower than the refused bytes'.
4. **Retirement only for the gas cap and a halted node (medium).** The generic "rejected before execution" prefix alone no longer retires a command, in either journal: a duplicate resend answered that way while the original is still in flight also sees its nonce unused, and those bytes could execute later. The nonce check is kept.
5. **Identical bytes after a retirement (low).** viem signs deterministically, so the same control at the freed nonce is the refused bytes again. The browser journal refused them as "already resolved" forever. It now accepts bytes whose only earlier entry was refused (never executed), and the lost copy is dropped so the receipt resolves the new entry. The test that hid this signed the next command with another gas limit; it now signs the identical bytes.
6. **The journal is scoped to the epoch.** Ported from `codex/contract-authority` (`e892c30`, "Let a command lost with its epoch be sent again in the next"): the "already resolved" check applies only within one epoch, so a `registerControls` lost with epoch 6 is sent again, byte-identical, in epoch 7. Its test is ported, and one more covers the 6 to 7 case.
7. **The maintenance loop and frozen matches (medium)** (`maintenanceTickDue` in `relayer/src/chaos-tick-guard.ts`).
   - **The defect.** The loop kept ticking a frozen match every 2 s, at about 29 M gas per revert, until the 30-minute cancel: double the node's load, and each revert held the single writer while a second, healthy match's guard tick waited past its tolerance.
   - **Now.** Once a relayer tick of a match has reverted with no progress since, the loop stops ticking it too. It sends one tick when the contract's 30-minute cancel is due: `target > 30 minutes * 1,000,000` µs, with target = anchor + (block - start) × 10 ms, which is exactly the snapshot's `clock` at the node's latest block. That tick cancels before simulating anything. It also sends one when a node restart makes the gap small enough to re-anchor (500 µs... 500 ms or less). Either is repeated at most every 10 s if the send itself fails. Logs: `rooms-frozen-match-cancel-due`, `rooms-frozen-match-reanchor`.
8. **The health read (low-medium).** `/health` now runs on its own 5 s schedule, one read at a time, never inside the 2 s maintenance loop. It goes through the node's shared request gate (refused locally during a Retry-After; a 429 from `/health` extends that cooldown for every request) and the RPC metrics as `health`. A report naming another app or epoch than the session's is ignored (`health.mismatch`), so the halted epoch-6 node never halts epoch 7, and a renewed node's report never clears epoch 6 early.
9. **Finalization fragility (low).** Finalized results and results that can never be finalized (published terminal with `matchEpoch` 0: an expired offer, or a match nobody opened a round for) are remembered and never read again by the process; unpublished ones are not read again within the same epoch's pass. One failed read skips only its own result: the pass goes on, and the lifecycle retries before `renewEngine`. After six failing passes in a row (about a minute), that result is deferred as `unreadable`, so it cannot hold the renewal forever; a later epoch's pass tries it again.
10. **The halt message.** It no longer claims that finished results are saved: a batch the node could not settle is lost with its epoch. It now says the session is saved and that matches whose results were not yet published resume from their last published state.

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

1. **Deploy this branch first**, relayer and web, after review. It must be running before `renewEngine`, for these reasons:
   - the release relayer's finalizing pass deadlocks on the frozen match;
   - its 15 M maintenance loop would freeze the resumed match again, and it would offer the match's epoch-6 beacon proof and pressure every 2 s ahead of the guard;
   - the release deletes the match's room about 24 hours after its last activity and then deletes the stale row without restoring anything. This branch recreates the room from `il_offers`, or watches the match by id if it cannot.

   Deploying before the `forceClose` also shows players the halt instead of `online:true`, and nothing new is signed for the halted node. After deployment:
   - `/api/interlude/config` should report `online:false` and `errorCode:"ENGINE_HALTED"` (`ENGINE_RENEWING` once the lifecycle moves on), and `commandGas:"30000000"`;
   - the relayer log should show `rooms-engine-halted`.

   The new table `il_engine_refusals` is additive. Leave `ROOMS_ENGINE_COMMAND_GAS` empty for 30,000,000.
2. **Read-only checks before the `forceClose`.**
   - Hub `sessionOf(app, 0x0)`: status 1, epoch 6, batch index 190, and the current time past `lastCommitAt` plus `maxBatchInterval`.
   - `SELECT status, count(*) FROM il_engine_jobs WHERE app = '0x78d3341e3452d7ec1add9371de3008639eed8eb0' GROUP BY status`. Any pending command becomes obsolete at release.
   - `SELECT id, room, phase, published FROM il_results WHERE app = '0x78d3341e3452d7ec1add9371de3008639eed8eb0' AND NOT published`. Expect the frozen match: phase 4, not published. **Use this id** in the checks below: the id recorded at the top of this note reads as no match on Monad (state at 10:55).
   - `SELECT room FROM il_offers WHERE app = '0x78d3341e3452d7ec1add9371de3008639eed8eb0' AND id = '<id>'`. A row means the room can be recreated if it is gone; no row means the match will be watched by id (`rooms-match-orphaned`).
   - `SELECT count(*) FROM il_bettors WHERE id = '<id>'`. Its bettors are paid only after epoch 7; see step 5.
   - On Monad, `chaosState(<id>)` on the app: `getSnapshot` phase 2, and the last two words are the beacon request (field 29) and the proven draw (field 30). Bits 64 to 95 of the request are its epoch (6). A zero draw means the match gets no new Chaos draw in epoch 7; a non-zero draw is announced there and draws continue.
3. **Force the close.** Anyone may call `forceClose(0x78d3341e3452d7ec1add9371de3008639eed8eb0, 0x0000000000000000000000000000000000000000000000000000000000000000)` on the hub. The lifecycle then moves by itself:
   1. `challenge` (hub status 2) until `stakeUnlockAt`;
   2. `releaseStake`;
   3. `finalizing`: epoch-6 pending and quarantined commands become obsolete, the published results are finalized, and the frozen match is deferred (`rooms-lifecycle-finalization-deferred`, plus `rooms-finance-capture-deferred` if it has bettors). A result whose reads fail is retried, then deferred as `unreadable` after about a minute;
   4. `renewEngine`, then the hosted renewal request for epoch 7.
4. **Epoch 7 starts.** The lifecycle stays in `starting` until the node reports epoch 7 and the hub's batch index.
   - **Restore.** The result audit sees the frozen match live again. It restores it into its room, recreating the room from `il_offers` if it is gone (`rooms-match-room-recreated`), and only then deletes the stale row. If it cannot (`rooms-match-orphaned`), the row stays and the relayer ticks the match by id until it ends.
   - **Epoch-6 commands.** Expect `rooms-chaos-draws-suspended` if the request was still pending, and `rooms-chaos-pressure-suspended` once pressure is considered. Neither is ever sent.
   - **First command.** A node whose block counter starts below the published anchor re-anchors the clock on the first command, which simulates nothing (`testResumedGridMatchNeedsTheGuardCadence`). A counter far enough above the anchor to put the match clock past 30 minutes makes the first command cancel the match instead, again without simulating. Only a counter slightly above the anchor would face a large gap and freeze; the maintenance loop then stays silent until the cancel is due and sends one tick (`rooms-frozen-match-cancel-due`).
   - **Play.** Once the lifecycle reaches `playing`, the guard ticks the match about every 0.6 to 0.84 s. Its players have probably left, so it plays on alone until one side reaches 7.
   - **Gas-cap check.** If this node refuses 30 M commands, the relayer reports `ENGINE_GAS_CAP` (log `rooms-engine-gas-cap`) and closes the arena by itself. Set `ROOMS_ENGINE_COMMAND_GAS=15000000` and recreate the relayer container with the new environment (`docker compose up -d relayer`; no rebuild). Browsers pick the limit up from the config. At 15 M even the guard's 840 ms cannot keep a grid state moving (540 to 730 ms), so a resumed grid match can freeze again until its 30-minute cancel.
5. **Afterwards.**
   - **Result.** The match's end is recorded, and the recorded result becomes published.
   - **Bettors.** Its `matchEpoch` stays 6, and while epoch 7 is active the adapter refuses to finalize it ("match epoch changed"). Its bettors are therefore paid in the finalizing pass at the end of epoch 7.
   - **Paddles.** Bets placed during the freeze cannot change its paddles in epoch 7: live pressure is bound to epoch 6, which the contract rejects, and the relayer no longer attempts it.

## What it still does not cover

- **30 M acceptance on this node.** Nobody has observed this node accept a 30 M command. The agent arcade's newer nodes accept exactly 30,000,000 from its coordinator. A refusal is now detected and closes the arena; the fallback is an environment change and a container recreation.
- **Browser retries during a freeze.** The players' browsers still retry a frozen match every 1 to 2 s until the 30-minute cancel. The relayer no longer adds to this.
- **The match id.** The id recorded at the top of this note could not be found on Monad or on the node; the recovery takes it from `il_results`.
- **Batch 191 itself.** The relay's refusal ("commit failed: Missing or invalid parameters.") belongs to Interlude's commit relay. Nothing on our side explains it, and nothing links it to the reverted commands.
- **The interim's remaining limits:**
  - a `Retry-After` (429) that applies to every sender;
  - network partitions longer than the tolerance, a disconnected stream or a stopped relayer;
  - relayer round trips above 215 ms in the worst state;
  - the browser backup, which cannot rescue the worst state.
- **Complete fix.** Gas-bounded slicing inside `ChaosGameFlow.advance` needs a new library, root app, finance bindings, hosted engine and delegation.

## Checks

- `tsc --noEmit -p .` passed.
- `tsx --test tests/*.test.ts` passed 263 of 263: 233 on `fix/human-chaos-recovery`, plus 30 for the second review:
  - restoration, recreated rooms and orphans: `tests/rooms-restore.test.ts`;
  - commands bound to another epoch: `tests/rooms-command-epoch.test.ts`;
  - the frozen-match maintenance rule and the configurable gas limit: `tests/rooms-maintenance.test.ts` and `tests/compact-rooms-session.test.ts`;
  - gas-cap unavailability, the narrowed refusal rule, the health schedule, gate and session match, and the halt message: `tests/engine-halt.test.ts`;
  - refused and epoch-lost bytes in the browser journal: `tests/rooms-command-journal.test.ts` and `tests/rooms-engine-recovery.test.ts`;
  - the finalization memory and read failures: `tests/rooms-finalization.test.ts`.
- `forge test --root contracts --match-path test/HumanChaosTickGas.t.sol` passed 16 of 16: 7 release reproductions at 15 M, 6 interim measurements at 30 M, and 3 new epoch-change tests (`HumanChaosRenewedEpochTest`: a pending epoch-6 request never draws again, epoch-6 pressure is rejected, a proven draw is announced and the next request carries the new epoch).
- **Not run.** No live node, browser, relayer or database run, no deployment and no transaction. The read-only checks at 10:55 were `eth_call`s only.
