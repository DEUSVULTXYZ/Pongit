# Chaos corrected: simultaneous contacts and gas-bounded advances

Prepared on 19 September 2026 on branch `fix/chaos-corrected`, based on production `origin/main` (`853f174`). It corrects two defects in the deployed human Chaos code, the application `0x78d3341e3452d7ec1add9371de3008639eed8eb0` (rules 6). **Nothing was deployed, sent or pushed.** Production keeps rules 6 until the migration described at the end.

| | Defect | Fix | Outcome |
| --- | --- | --- | --- |
| 1 | In a microsecond with several contacts, only the tie-break winner was resolved. A second Multiball ball could pass through a paddle that covered it. | Every wall, paddle, shield and goal plane reached in that microsecond is resolved, in the kernel and in the TypeScript mirror. | Outcomes change: **rules 8** |
| 2 | One command simulated the whole gap since the last success. During a force grid, a gap above ~0.73 s cost more than 15M gas. The match froze until the 30-minute cancel. | `ChaosGameFlow.advance` runs in gas-bounded slices and resumes on the next command. | Play is unchanged, bit for bit |

## 1. Simultaneous contacts

### Defect

The kernel resolved one contact per step:

1. `ChaosContacts.next` returns the single best candidate. `offer()` ranks by (dt, kind, ball).
2. `ChaosPhysics.run` moves both balls to `t + hit.dt` and resolves only `hit`.
3. Contact times are rounded up (`ChaosGeometry.ceil`). Any other ball that reached a plane in the same microsecond therefore ends *strictly past* it.
4. From there, `plane()` returns `NEVER`, and the paddle predicate `b.x >= 40` fails. The contact is lost.

An exact landing (distance divisible by speed) was not lost: it came back as a dt = 0 contact on the next step.

The TypeScript mirror (`shared/physics-chaos-events.ts`) is a line-for-line port with the same defect. That is why the differential never caught it.

**Multiball makes it systematic.** The second ball is a copy of the first with only `vy` negated. Both balls share `x` and `vx`, so every paddle arrival is a same-microsecond tie.

**Production, 2026-09-18.** At t = 13.470 s both balls were at x = 91 px, moving at (−232.32, −116.16) px/s. The left paddle was centred at 262 px with a half-height of 48 px. Both balls crossed x = 40 at t = 13.689525 s, at y = 235.5 and y = 279.5, both within reach (54 px). Ball 0 was returned; ball 1 scored, taking the score from 1–0 to 1–1.

The same mechanism, as reproduced on the rules-6 kernel (`contracts/test/legacy/ChaosPhysicsRules6.sol`):

| Case | Rules 6 |
| --- | --- |
| Lockstep Multiball, paddle covering both | second ball through the paddle: **83 of 83** covered arrivals in a 300-spawn survey |
| Two balls on opposite paddles, same µs | kind 3 wins; the right-paddle ball passes and A scores |
| Ball 0 at the paddle, ball 1 at a wall, same µs | the wall (kind 1) wins; ball 0 passes a covering paddle |
| One ball in a corner (wall and paddle, same µs) | the wall is resolved; the paddle is lost; B scores |
| Mirrored balls at opposite walls, same µs | ball 1 leaves the table through the floor |
| Paddle due exactly on a 10 ms force tick (wind) | the paddle is lost; B scores through a centred paddle |
| Goal due exactly on a force tick | no point; the ball flies on to \|x\| > 2^53, and the **whole match is technically cancelled** (reason 1) |
| Paddle due exactly when an effect starts | the paddle is lost |

### Fix

A contact that falls in the microsecond where a move ends is resolved, and so is every other one in that microsecond. The rules below apply to both the kernel and the mirror.

**Plane times.** `ChaosContacts.next` also returns `planes`: each ball's wall, paddle and shield contact times. It computes them under exactly the predicates of the offers.

**The sweep.** After resolving `hit`, `ChaosPhysics.sweep` resolves every other wall (kinds 1–2), paddle (3–4) and shield (7–8) contact whose time equals `hit.dt` and that the move carried *strictly* past its plane.
- **Order:** `offer()`'s order, kind then ball, which is the order an exact landing already had.
- **Revalidation:** each contact counts only if the ball still heads into the plane after the contacts resolved before it. A shield must still hold its charge, so one charge saves one ball and never reverts.
- **Sources:** `ChaosPhysics.sol` `run` / `sweep` / `shielded`; `ChaosContacts.sol` `next`.

**Boundary ties.** The move reaches a force tick or an effect boundary in the same microsecond as `hit`. Then:
- A goal that the move carried strictly past scores at once, together with every goal due in that microsecond.
- Otherwise, the strictly crossed planes are swept against the effects as they are at the boundary. A shield expiring at that very microsecond saves nothing and nothing reverts.
- The boundary itself is processed on the next step, as before.

**Unchanged.** An exact landing still goes through the dt = 0 path, as in rules 6. Rules 8 therefore differs from rules 6 only where rules 6 *lost* a contact. The state layout and the codec are unchanged.

**Log capacity.**
- A kernel call still stops once `LOG_STOP` = 8 collisions are logged.
- One microsecond can add at most 6: a wall, a paddle and a shield for each ball.
- The log therefore holds `LOG_CAPACITY` = 13. `ChaosEngine` keeps 4 × 13 = 52 entries and checks `physics.LOG_CAPACITY() * 4 <= 52` in its constructor.

**Mirror.** The mirror carries the identical change. `advanceChaosEvents(..., everyContact = false)` reproduces the rules-6 kernel. The web chooses by the manifest's rules (`shared/chaos-rules.ts`), so prediction stays right for both applications.

**Not covered.** Obstacles are not swept: bricks, bumper, deflector, portals, pickup, and the warp and well boundaries. If two balls reach an obstacle in the same microsecond, only the winner acts, exactly as in rules 6.
- An obstacle tie needs both an x and a y coincidence, so it is not systematic.
- It can neither score through a paddle nor leave the table.
- `testObstacleTiesAreUnchangedFromRules6` pins this behaviour.

### Evidence

`contracts/test/ChaosSimultaneousContacts.t.sol` has 23 tests. Each runs on the rules-8 kernel and, for comparison, on `ChaosPhysicsRules6`:

- **Replay.** Both balls are returned, and both hits are logged in the same microsecond. This holds through `ChaosEngine` and the codec. Rules 6 gives 1–1.
- **One shared microsecond:** opposite paddles; a wall and a paddle on two balls; a single-ball corner; opposite walls.
- **Boundaries:** a paddle on a force tick; a goal on a force tick (scored, where rules 6 cancelled the match); a paddle on an effect start; a shield expiring at the contact.
- **Guards:**
  - a one-charge shield reached by both balls saves one;
  - the first ball misses and the second is returned;
  - the second misses and scores under both rules;
  - an obstacle tie is identical to rules 6.
- **Controls, bit-identical to rules 6:** a lone ball; an exact-landing tie; one microsecond apart; a corner one microsecond apart. A fuzz of 1,000 lone-ball states without a force grid or Multiball is also identical.
- **Partition invariance:** a fuzz of 1,000 two-ball states, lockstep or independent.
- **Log capacity:**
  - seven wall bounces, then both walls and both paddles in one microsecond: 7 + 4 = 11 entries in one call, sequences contiguous;
  - through `ChaosEngine`, no entry is dropped;
  - rules 6 stops at 8, and B scores.
- **Survey:** 300 lockstep Multiball spawns give 83 arrivals with the paddle covering both balls. Rules 8 lets **0** through; rules 6 lets **83** through.

TypeScript:
- `tests/chaos-simultaneous-contacts.test.ts` has 7 tests: the same cases on the mirror, including the 300-spawn survey (0 through).
- `tests/chaos-rules.test.ts` has 3 tests, including the mirror's rules-6 mode reproducing 1–1.

**Differential.** `scripts/differential-chaos-events.ts` compares the contract with the mirror (`eth_call` on a local Anvil chain) and ran **24,000 cases with 0 mismatches**.
- The 10,000 random cases of the original script.
- **10,000 constructed simultaneous cases:** lockstep Multiball at a paddle; two balls on independent planes in one microsecond; corners; contacts on force ticks (wind, curve) and on effect starts and expiries; a full log. They mix exact landings, missed paddles, charged and empty shields, target-at-contact, stop-at-point and budgets from 1 to 256.
- 4,000 cases of the mirror's rules-6 mode against the deployed rules-6 kernel.

| Family | Cases | Two collisions in one µs | Collision in the constructed µs | Points |
| --- | ---: | ---: | ---: | ---: |
| random (rules 8) | 10,000 | 124 | – | 2,024 |
| lockstep | 1,667 | 915 | 1,359 | 335 |
| two planes | 3,334 | 1,265 | 1,554 | 1,054 |
| corner | 1,667 | 164 | 671 | 234 |
| boundary | 1,666 | 365 | 635 | 580 |
| capacity | 1,666 | 1,666 | 1,666 | 0 |
| rules 6: 2,000 random and 2,000 constructed | 4,000 | 9 | 1,110 | 1,216 |

On rules 6, the constructed families produce shared-microsecond collisions only from exact landings. It logs almost nothing at a boundary tie: 4 of 333 cases. That is the defect.

Run: `PONG_CHAOS_PHYSICS_TEST=isolated-vps npx tsx scripts/differential-chaos-events.ts`. `PONG_CHAOS_PHYSICS_CASES`, `PONG_CHAOS_TIE_CASES` and `PONG_CHAOS_LEGACY_CASES` set the counts.

## 2. Freeze on force-grid gaps

### Defect

The investigation of 18 September (branch `claude/sleepy-elion-1200d4`, `docs/validation/human-chaos-tick-gas-2026-09-18.md`) found the following.
- A human Chaos command simulated the whole gap since the last successful advance, with no gas-aware stopping point.
- During a force grid the kernel forces every 10 ms. The grid-forcing states are wind (17), the well (16) with a ball inside, and a curve shot's 150 kicks.
- **Thresholds:** a gap above ~0.73 s did not fit 15M gas (1.41 s at 30M; worst case, two balls in the well, 1.03 s at 30M).
- **No recovery:** a revert processes nothing, so every later command needed more gas. The match stayed frozen until the 30-minute cancel.
- **Production, 2026-09-18:** this froze a match and ~1,350 reverted retries followed. The hosted relay refused the batch carrying the eventual cancel, and human production halted.

### Fix

The fix lives in `ChaosGameFlow.advance`, the linked library. The root has 340 bytes of EIP-170 headroom, and its source only changes its `RULES_VERSION` constant.

```text
do { slice(t + span) } while (complete && t < target && gasleft() > ADVANCE_RESERVE)
complete = complete && t == target
```

- `ADVANCE_RESERVE` = 5,000,000. It covers the costliest slice, a ranked result and the publication.
- **Slice length (`span`):**
  - 100 ms (`SLICE_US`) while wind (17), the well (16) or a curve shot (5) is in either effect slot, or a ball curves;
  - otherwise 1 s (`PLAIN_SLICE_US`).
- **Why a 1 s plain slice is safe.** A plain slice cannot enter a force grid before its last millisecond:
  - a drawn effect starts on the millisecond one second after its announcement;
  - a mystery reward is always effect 1–4.
- **Why not 100 ms everywhere.** Each slice has a fixed cost of about 0.35M gas. Fixed 100 ms slices raised a plain 300 ms tick from 0.44M to 1.1M gas, and a 3 s plain gap no longer fitted one command.
- **Why results do not change.** The kernel is call-partition invariant, so where a command stops never changes play.
- **Incomplete commands.** A command that stops short reports incomplete. `tick` publishes the progress. `input` and `concede` return the existing, recoverable `CatchUpRequired` until the clock catches up. `submitLivePressure` queues nothing until then.
- **The body is unchanged.** Each slice runs the unchanged rules-6 body: 3 attempts, announcements at their due time, the beacon request.

### Evidence

`contracts/test/ChaosGameFlowGas.t.sol` has 11 tests. They run against the production `PongChaosEvents` class with one fixture setter; nothing on the advance path is wrapped or overridden. Each command is a `tick` at 14,800,000 gas with cold storage.

| State | 300 ms gap | Longer gaps, 0.9–60 s |
| --- | --- | --- |
| wind | 300 ms, 6.1M | 500 ms per command, 10.1M |
| well, ball inside | 300 ms, 6.6M | 500 ms, 10.9M |
| curve shot | 300 ms, 6.3M | 500 ms, 10.5M |
| wind, two balls | 300 ms, 7.6M | 400 ms, 10.0M |
| well, two balls inside | 300 ms, 8.5M | 400 ms, 11.3M |
| wind, two balls curving | 300 ms, 8.1M | 400 ms, 10.7M |
| well, two balls curving | 300 ms, 9.0M | 400 ms, 11.9M |
| jackpot, one ball (plain) | 300 ms, 0.44M | 10 s in one command (4.7M); 19 s of a 60 s gap |
| two fast balls with bricks, portals, bumper or deflector (plain) | 300 ms, 0.5–1.0M | 10 s in one command (5.8–6.6M); 16–17 s of 60 s |

- **No gap reverts.** No gap from 300 ms to 60 s reverts in any of these states.
- **Costliest slices, fitting the reserve.** The costliest measured 100 ms command is **3,107,544** gas (two curving balls in the well, with the rules-8 kernel). The same state with the ranked seventh point in the command costs 2,571,593. The costliest 1 s plain command is 2,073,949 (two fast balls among the portals). Each figure is a whole cold command including the root and the publication, so it overstates the slice. All are under the 5M reserve.
- **Ranked finish in any slice.** A ranked seventh point was placed at every 10 ms position from 100 to 800 ms, in two-ball wind. The match always finishes, rates exactly once and publishes its result.
- **Bit-identical.** Bounded commands reach the same eight words as the unsliced engine loop and as one unbounded command. This was checked over 7 s of wind, a goal and plain play (10 commands), and over 30 s of fast two-ball plain play (2 commands).
- **Catch-up.** With the backup ticking every 450 ms:
  - a 1.2 s takeover in the wind catches up in 10 commands (5.25 s);
  - a 10 s Retry-After stall catches up in 11 commands (14.5 s);
  - inputs are refused, recoverably, meanwhile, and accepted afterwards.
- **The 2026-09-18 sequence.** It no longer freezes: the late tick advances, play continues, and the match finishes normally.
- **Announced wind.** An announced wind keeps 100 ms slices before it starts: the same second costs 3.49M instead of 0.44M.

The agent arcade (`codex/contract-authority`) already slices in its own root: 100 ms per call, with a 6M reserve. Each of its calls therefore reaches this loop with at most one slice, and its behaviour is unchanged.

The branch merges into the arcade with a one-line conflict: `RULES_VERSION` becomes `virtual` on the arcade and 8 here, and the resolution is `public pure virtual override ... {return 8;}`. On that merged tree:
- 438 tests pass and 2 are skipped.
- One arcade test fails, and only on Forge's default per-test gas limit of 2^30: `testNoSteeredTickOutspendsAGameCommandEffects1To8` needs 1,099,912,132 gas, against 1,060,012,093 on the arcade alone.
- With a raised limit the whole arcade suite passes, 50 of 50.
- `PongAgentArcade` stays 24,561 bytes.

## 3. Rules version: 8

Rules 8 resolves contacts that rules 6 lost, and that changes outcomes: the second ball is returned instead of scoring, and a goal on a force tick scores instead of cancelling the match. A rules-6 ticket, betting window or result hash denotes the kernel deployed on 13 September, so the corrected game cannot keep 6. The next free number is not 7: that belongs to the Agent Arcade, a separate application that still links the rules-6 kernel (`deployments/agents.json`, `AgentResultArchive` and `shared/agent-client.ts` on `codex/contract-authority`). The human Chaos events application therefore becomes **rules 8**, for new instances only.

| Binding | Rules 8 |
| --- | --- |
| Offers | `PongChaosEvents.RULES_VERSION()` = 8. `acceptMatch` refuses every other ticket; `testOnlyRulesEightTicketsOpenAMatch` checks 6 and 7. The coordinator signs `manifest.rulesVersion`, so the manifest must say 8. |
| Settlement | `ChaosEventsSettlement` requires `RULES_VERSION() == RULES` (8) at construction and refuses 5, 6 and 7. Betting windows are versioned `(epoch << 8) \| 8`. A rules-6 game keeps its already deployed settlement. |
| Result hashes | `_finish` hashes `RULES_VERSION()` into every result, so rules-8 results are distinct from rules-6 results. |
| Snapshot | The `Snapshot` event's leading byte stays **6**. It is the packed-state format (`ChaosCodec`), which is unchanged, and clients reject any other; the arcade already publishes it under rules 7. |
| Clients | `shared/chaos-rules.ts` names the events rules {6, 8}. The relayer, the finance manifest validation and adapter ABI, the web client and the indexer configuration accept either. Finance checks the app's actual `RULES_VERSION` against the manifest. Manifests are **unchanged**. |

## 4. Contract sizes

`forge build --sizes`, solc 0.8.30, via-IR, 200 runs. EIP-170 allows 24,576 bytes.

| Contract | Runtime before | Runtime after | Margin | Initcode after |
| --- | ---: | ---: | ---: | ---: |
| ChaosContacts | 10,553 | 11,017 | 13,559 | 11,175 |
| ChaosPhysics | 16,374 | 18,484 | 6,092 | 18,850 |
| ChaosEngine | 8,446 | 8,446 | 16,130 | 9,106 |
| ChaosGameFlow (library) | 11,387 | 11,921 | 12,655 | 11,953 |
| ChaosEventsSettlement | 6,981 | 7,018 | 17,558 | 7,656 |
| PongChaosEvents (root, links ChaosGameFlow) | 24,236 | 24,236 | **340** | 36,868 |
| PongAgentArcade (merged tree, links ChaosGameFlow) | 24,561 | 24,561 | 15 | 37,148 |

Seven modules compile to the same bytecode as the deployed source (`9a79046`/`853f174`), so they can be reused: ChaosEffects, ChaosModifiers, ChaosRally, ChaosDynamics, ChaosCodec, DrandEvmnet and ChaosDrawRules.

## 5. Test runs

| Command | Result |
| --- | --- |
| `forge test --root contracts` | 36 suites, 379 passed, 0 failed, 2 skipped. Baseline `853f174`: 34 suites, 344 passed, 2 skipped. |
| `npx tsc --noEmit -p .` | passes |
| `npx tsx --test tests/*.test.ts` | 212 passed, 0 failed. Baseline: 202. |
| `npm run test:differential:v2` | passes: both physics modes agree with Solidity, 10,000 cases each |
| `PONG_CHAOS_PHYSICS_TEST=isolated-vps npx tsx scripts/differential-chaos-events.ts` | 24,000 cases, 0 mismatches |

## 6. What a production migration requires (not done)

The library and module addresses are fixed in the root's bytecode, and instances are never upgraded in place. The correction is therefore a new application. It follows the 13 September procedure (`docs/CHAOS_EVENTS_CANDIDATE.md#deployment-and-rollback`).

1. **Build and verify.** Build from a pinned commit of this branch. Check the on-chain code hashes of the reused modules (`deployments/chaos-events.json` `modules`) against that build.
2. **Physics modules on Monad (10143).**
   - Deploy `ChaosContacts(ChaosDynamics 0x0e6fc645…53c2)`.
   - Deploy `ChaosPhysics(ChaosEffects 0xfec0f2da…8738, ChaosRally 0xa28023cc…32ac, ChaosDynamics, new ChaosContacts)`.
   - Deploy `ChaosEngine(ChaosCodec 0x732ab383…4e75, new ChaosPhysics, DrandEvmnet 0x7f742cf1…ce84, ChaosDrawRules 0x8fc423fa…0028)`.
   - Deploy the patched `ChaosGameFlow` library.
3. **Qualify on an integration app first**, as on 13 September. It must have identical runtime bytecode. Cover the hosted engine, verified draws, real bets, a Chromium run with two players and a spectator, and a grid stall that catches up.
4. **Production app.** Deploy `PongChaosEvents(hub 0x3Ef8327F…D595, coordinator 0x6e0EbC79…3d73, pressureSigner 0x15E6B4C9…7659, operator, previous = 0x78d3341e3452d7ec1add9371de3008639eed8eb0, new ChaosEngine)`, linked to the new library. `_startingRating` then reads the rules-6 app's ratings, which carry its own previous chain.
5. **Finance, bound to the new address.**
   - Deploy `ChaosEventsSettlement(app)`, which checks rules 8.
   - Deploy `RoomsVault(owner)`.
   - Deploy `RealtimeMarket(owner, treasury, adapter, maker, vault)`, with the treasury and maker read from the current market `0x1e749575…3a3c`.
   - Then call `registerModule(market)` and `seal()`.
   - Keep the old adapter, market and vault (`0xd7602b6a…822f`, `0x1e749575…3a3c`, `0xfb246085…5929`) for outstanding claims.
6. **Interlude.** Open a hosted engine and delegation (epoch 1) for the new app.
7. **Drain rules 6.**
   - Stop admissions.
   - Wait for `activeCount() == 0`. A frozen match cancels itself within 30 minutes.
   - Call `closeEngine`.
8. **Manifests.**
   - `deployments/interlude-rooms.json`: app, node, `rulesVersion: 8`, `previousRooms` 0x78d3…8eb0, history.
   - `deployments/chaos-events.json`: game, finance, modules, flow.
   - `deployments/rooms-finance.json`: a new entry with `rulesVersion: 8`, a new `financeId` and the adapter's `startBlock`.
9. **Relayer and coordinator.**
   - Point `INTERLUDE_ROOMS_MANIFEST` and `ROOMS_FINANCE_MANIFEST` at the new entries. The code on this branch accepts 8, and the coordinator then signs rules-8 tickets.
   - Keep the pressure signer file.
10. **Web.** Rebuild with the new manifest. The web then uses the events ABI, and prediction uses the rules-8 mirror. Update the public pages that describe rules 6: `web/content/docs/playing/chaos.mdx` and `technical/{physics,contracts,api}.mdx`.
11. **Indexer.**
    - `scripts/configure-indexer.ts` (accepts 8) adds the new `ChaosEventsArchive` adapter and its start block.
    - `indexer/src/chaos-archive.ts` still writes `rulesVersion: 6` for every `MatchRecorded`, and must map the new adapter to 8.
    - Update the Hasura configuration.
12. **Scripts.** `scripts/deploy-chaos-events.ts`, `qualify-chaos-events.ts` and `chaos-events-live.ts` are the 13 September one-offs, with hard-coded addresses and `rules: 6n`. A rules-8 deployment and qualification need rules-8 equivalents.
13. **Release checks.** Repeat them, including the 10,000-case differentials.

The Agent Arcade is unaffected until it is rebuilt. Rebuilt on this kernel, its outcomes change too, and it needs its own new rules number. It would also need the `RULES_VERSION` merge resolution above and a larger test gas limit.

## 7. Open issues

- **Obstacle ties.** They still resolve only the winner, as in rules 6 (section 1, "Not covered").
- **Ordering inside a shared microsecond.** A strict crossing is resolved at once. An exact landing waits for the next step's dt = 0 contact, and at a boundary tie that step comes after the boundary. In a microsecond that mixes both, the strict contacts precede the exact ones. The order is deterministic and the same in the kernel and the mirror.
- **Multiball ending at a boundary tie.** When Multiball expires on a tie, the second ball's strictly crossed contacts at that microsecond are resolved before the ball disappears at the boundary.
- **Late randomness during a catch-up.** A `submitRandomness` landing during a catch-up stores the draw at the processed clock. If the draw is already due, it is announced there rather than at the block-derived target. It remains deterministic and applies at the first processed time at or after its due time.
- **Per-test gas limit in the arcade.** On the merged tree, one arcade test needs its per-test gas limit raised (section 2).
- **Not measured.** Browser and relay round trips, and the hosted node's behaviour with sliced commands. The interim mitigation (30M command gas and a relayer tick guard, branch `fix/human-chaos-interim`) is independent of this branch and still applies to the rules-6 app until migration.
