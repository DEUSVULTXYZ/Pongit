# Human Chaos freeze: interim mitigation without a redeploy

18 September 2026, branch `fix/human-chaos-interim` from release `853f174`. This changes no contract and needs no redeployment. It has not been deployed.

The fault is described in the investigation of the same day (`docs/validation/human-chaos-tick-gas-2026-09-18.md`, investigation branch). A Chaos advance simulates, in one call, the whole gap since the last successful advancing command. A force-grid state makes that gap expensive:

- effect 17 (wind), always;
- effect 16 (gravity well), while a ball is inside the well;
- a curve shot, for its 1.5 s of kicks.

A command that runs out of gas reverts without progress. The next command then needs even more gas, so the match freezes until the contract's 30-minute cancel.

## What the interim changes

1. **30,000,000 gas on every game-node command.** A shared constant, `ENGINE_COMMAND_GAS` in `shared/engine-gas.ts`, now sets the limit for:
   - all relayer public commands: `tick`, `cancelMatch`, `submitPressure`, `submitLivePressure` and `submitRandomness`;
   - all browser compact controls (`shared/compact-rooms-session.ts`).

   The value is exactly 30,000,000 because that is the largest transaction the hosted node accepts; larger ones are refused before execution. Gas is free on this chain (`maxFeePerGas` 0), and the limit is a ceiling, not a charge.

   `tick`, `input` and `concede` advance the clock and need this headroom. `acceptMatch`, `cancelMatch`, `registerControls` and `revokeControls` never simulate. They take the same limit anyway: it costs them nothing, and no command is left behind if a future rule makes it advance.
2. **A fast relayer guard for live Chaos matches** (`relayer/src/chaos-tick-guard.ts`). It runs every 100 ms and does no I/O: it only reads the applied-event feed the maintenance loop already watches.
   - **When it ticks.** It ticks a match only if all of these hold: the app is rules 6, state streaming is enabled (as in production), the match is in phase 2 and mode 1, it is not awaiting a serve, and the relayer has seen no progress for 500 ms.
   - **How it sends.** It uses the existing `publicTick` path: the same coalescing key, the single serialized writer and the persisted `il_engine_jobs` journal.
   - **When it stays quiet.** It skips a match while any relayer command for that match, or a journal recovery, is queued or in flight. It sends nothing when the latest maintenance check did not allow commands (delegation, publication, lifecycle, closing, maintenance retry), or while the node's `Retry-After` cooldown runs.
   - **Backoff.** It waits 5 s after a confirmed revert (a probable freeze) and 1 s after a transport failure.
   - **Unchanged.** Classic matches, rules 4 and 5, the 2 s maintenance loop and its 1.5 s threshold keep their behaviour.
3. **One round trip less per new relayer command.** When a command is signed and sent in the same call, the relayer no longer looks up its receipt first; such a command cannot have a receipt yet. Pending entries recovered from the journal are still checked before they are resent.

## Measured tolerance

These are Forge measurements against the production `PongChaosEvents` class (`contracts/test/HumanChaosTickGas.t.sol`, `HumanChaosInterimGasTest`), with storage cold for each probe. The execution budgets are the command gas minus 21,000 intrinsic gas and the calldata cost. For `tick` that gives 14,978,424 at 15 M and 29,978,424 at 30 M.

| Grid state | Largest gap at 15 M | Largest gap at 30 M |
| --- | ---: | ---: |
| Wind, one ball | 730 ms | **1,410 ms** |
| Wind, two balls (effect 21) | 610 ms | **1,140 ms** |
| Curve shot in flight | 700 ms (at 14.8 M) | **1,350 ms** |
| Gravity well, ball inside | 680 ms (at 14.8 M) | 1.2 s now fits (26.6 M), see below |
| `input` from the backup, wind | not measured | 1,410 ms, same as `tick` |

- **The well has no measured failing gap in this fixture.** The ball leaves the well after about 1.25 s, and the cost levels off at 26.8 M. While the ball is inside, the cost grows about as fast as in the wind. By extrapolation, a longer stay would reach 30 M at about 1.3 s.
- **Wind gas by gap:** 20.0 M at 1.0 s, 24.9 M at 1.2 s, 28.8 M at 1.4 s. At 1.5 s it needs 30.5 M, so the tick reverts.

Here is what the new tolerances mean in practice. Round trips are node round trips; the VPS measured 120 ms at p50 and up to 300 ms at p99.

- **Healthy primary.** The gap is about 300 ms plus one round trip. It now fits round trips of up to about 1.1 s with one ball and about 0.8 s with two balls. Before, the limits were about 410 ms and 280 ms.
- **Relayer guard.** Its worst case is stream delivery, then 500 ms, then 100 ms, then the nonce read and the send: about 840 ms at a 120 ms round trip. That fits two balls up to about a 250 ms round trip, and one ball at 300 ms.
- **Browser backup.** It takes over 900 ms after the progress it observed. That gap now fits one ball; at 15 M it never fitted.

## Hub batches

The guard stays silent while anyone advances the match within 500 ms, and it never runs outside a live Chaos match.

- **Normal play.** A guard tick can race a slow primary, when round trips exceed about 200 ms. Such a tick lands in a second that already carries the players' commands.
- **Abandoned match.** The only new activity is a live match that nobody else ticks, for example with both tabs hidden. There the guard's cadence of about 0.7 s replaces the maintenance loop's 2 s.
- **Freeze avoided.** Before this change, such a match in a grid state froze. Reverted retries then continued until the cancel: from the relayer every 2 s, and from any visible client every 1–2 s.

## What it still does not cover

- **`Retry-After` (429) that applies to every sender.** The browsers wait at least 1 s, and 10 s has been recorded. The relayer's own cooldown pauses the guard.
- **A node restart that keeps its block counter.** Engine time runs during the restart, and the first command after it faces the whole gap. A restart with a lower counter re-anchors the clock and stays safe.
- **Network partitions longer than the tolerance.** This covers any partition that cuts both the relayer and the players off from the node for longer than the tolerance. It also covers the relayer's stream being disconnected, streaming being disabled, or the relayer being down: the guard is then off, and the 1.5 s maintenance fallback cannot rescue a grid state.
- **Two balls in the wind with a slow relayer path.** This means relayer round trips above about 250 ms, or a guard tick that queues behind another match's command.
- **A freeze that does start.** It still lasts until the 30-minute cancel, and each retry now executes about 29.0 M gas on the shared node instead of 13.9 M. The maintenance loop retries every 2 s, the guard every 5 s and the clients every 1–2 s.
- **Paths outside this change.** The browser `TickPilot` (the 900 ms backup takeover) and the independent arena's commands (`shared/compact-arena-session.ts`, `relayer/src/independent-engine.ts`) are unchanged.

## Complete fix

The complete fix is gas-bounded slicing inside `ChaosGameFlow.advance`: each command stops at a gas reserve and the next one resumes from the processed clock. The root has no EIP-170 room for the loop, and the library address is linked into the root. So the fix needs:

- a new library;
- a new root app;
- new finance bindings;
- a new hosted engine and delegation.

The investigation describes the redeploy procedure. With slicing in place, this interim's 30 M limit stays harmless.

## Checks

- `npx tsc --noEmit -p .` passed.
- `npx tsx --test tests/*.test.ts` passed 211 of 211 tests, including the new `tests/chaos-tick-guard.test.ts` and the 30 M assertions in `tests/compact-rooms-session.test.ts`.
- `forge test --root contracts --match-path test/HumanChaosTickGas.t.sol` passed 11 of 11: 7 release reproductions at 15 M and 4 interim measurements at 30 M.
- Not run: no live node, browser or relayer run and no deployment. The 30 M acceptance by the hosted node is taken from the agent arcade, which already sends 30 M ticks to the same node software.
