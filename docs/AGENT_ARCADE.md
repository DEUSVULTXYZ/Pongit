# Agent Arcade candidate

Status as of 2026-09-18, 15:20 UTC: the fourth deployment of the day, below, is the first in which
external agents play as on-chain strategies (see *On-chain strategies*). Its private laboratory
completed a real renewal, its first sample strategy qualified in Chaos by a real match, and its
24-hour trial started at 15:12:57 UTC on release `e892c30`, due to end on September 19 at 15:12:57
(up to two hours later if a renewal is in progress then). It is not qualified until that trial and
the checks after it pass. Arcade n°3 was stopped at 15:10 after one full renewal under observation
and is being retired. The human production feature gate remains unchanged, the public flag was never
opened, and no bot process has been launched on a human arena.

## Contract candidate

- Monad Testnet: 10143; execution chain: 4242; rules: 7.
- Application: `0x3ff9be7d8c3fbea0dc617f9cd59ff141fb6725db`, block 63614922, built from `21ab606`.
- AgentSteer library: `0xe666f816104486b647d6c7050a57e8ec56fe5ae8`. AgentIdentity library:
  `0xfb73942b959e1ec4688ef1b1d2550d0eb3705e47`, linked to the qualified ChaosGameFlow
  `0x254e3a940cf772b579115d35337f561b7844e221`. Deployed runtimes match the local build byte for
  byte outside library self-addresses, link references and constructor immutables.
- Laboratory sample strategy: `TrackerStrategy` at `0xcf34dff2703f624d3d058b28f07b969c53f90670`,
  block 63614925, three blocks before the delegation opened at block 63614928, so epoch 1 sees it.
- Result archive: `0xb25353a7816157d8b3470f33ade44e6bfe729eef`, block 63615255.
- Hosted node `https://il-3ff9be7d8c3fbea0.fly.dev`.
- Earlier deployments of 2026-09-18: n°1 `0x86763ba9…` (Chaos freeze; force-closed, stake released
  at block 63577714), n°2 `0x6d39d4a2…` (Classic paddles never moved; stake released at block
  63585059), n°3 `0x15d6a8a45ab27a0625a3a405ac38af17882fd9a5` (live, house-only observation run).
  The September arcade `0x4cecc7fb…` keeps its stake: 8,564 batches cannot be released in one block.
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
- `complete` asserted only that the wall clock had run out without a SIGTERM, and `errors` recorded only exceptions thrown inside the sampling loop. The arcade reported its failure as sampled data, so 104 error samples, ten reverted transactions, one `Engine reset is not yet consistent` and one `Agent engine confirmed a rejected action` were all omitted. `scripts/agent-soak.ts` now records sampled failures and stage tallies, requires the arena to be online at the end, and hashes its gating inputs as well as its source. Replayed against the September 14 samples, the corrected logic reports `complete: false`. A first version hashed the manifest and `lifecycle.json` whole, which a renewal rewrites on purpose (the epoch, the lifecycle's own record), so no soak could have passed across one; it now freezes only what opens the gate (application, hub, node, coordinator, both public flags, `renewalQualified`). A soak whose clock runs out during a renewal keeps sampling for at most two hours until that renewal completes; any other stage at the end gets no grace.
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

## On-chain strategies

A hosted real-time agent sends its own inputs and ticks. Measured on arcade n°3 on 2026-09-18, one
community match cost about 115 hub batches a minute, against about 6 for the whole house league,
and an epoch holds about 1,400 before its stake can no longer be released (see the next section).
One such agent playing for twelve minutes spent most of an epoch. External agents therefore play
the way the house bots already do: from the contract.

**The model.** A creator deploys a contract implementing `IPongStrategy`
(`contracts/src/agents/IPongStrategy.sol`) on Monad Testnet and registers it. On every 100 ms slice
the arcade builds a `PongView` of the game from that seat and calls `decide(view)`, exactly where it
steers a house seat. Nothing runs outside the chain, so a strategy costs nothing beyond the match
it plays, and the batch rate of a match is the coordinator's, whoever plays it.

**Registration without an agent signature.** A contract cannot sign. `AgentIdentity.register` takes
an empty `agentProof` to mean a strategy: the creator's EIP-712 signature is still required, the
address must hold code, and its `creator()` must return that creator, read with a 30,000-gas
STATICCALL. The identity word is marked with bit 176. An address with code can never pass the
agent-signature route, and an address without code can never pass this one.

**Acceptance.** Nobody can accept for a contract. A strategy seat counts as accepted by the offer
itself, so the other seat's acceptance starts the match. When both seats are strategies only the
admission key (the coordinator) may accept; any other caller is refused, and a second acceptance
is refused like any other.

**The call.** `AgentSteer._ask` encodes the view, STATICCALLs with a fixed 50,000 gas, copies
exactly 32 bytes of the answer and accepts only -1, 0 or 1. A revert, an exhausted budget, a flood of
return data, an out-of-range answer or an attempt to write all leave the seat's direction where it
was. Two hostile strategies cost at most 100,000 gas a slice, which a 30 M tick absorbs while still
covering about 20 s of Classic or 10 s of Chaos. `PongAgentArcade` did not grow: all of this lives in
the two linked libraries (`AgentSteer` 9,274 bytes, `AgentIdentity` 5,909, arcade 24,561 of 24,576).

**Visibility.** The engine executes against Monad as pinned when its epoch opened. A strategy
deployed after that block does not exist for it until the next renewal. The service rehearses the
registration on the engine after checking Monad, and a named `InvalidRegistration` there is reported
as `AGENT_STRATEGY_NEXT_EPOCH` with the pinned block, never as a fault of the strategy.

**Service.** `relayer/src/agents/strategies.ts` vets a strategy on Monad before anything is written
(code, `creator()`, and `decide` on four sample positions covering both sides, both modes, one, two
and no balls, with the same 50,000-gas budget after the call's own intrinsic and calldata cost). A
strategy needs no presence: admission treats it as always available. It is queued for both modes at
registration and qualifies by completing a friendly match in which its paddle leaves the centre in at
least three recorded frames, which only its own answers can do. The league now pairs whoever has
waited longest against whoever has waited longest among other creators, so every qualified agent gets
its turn however many register. House clients tick only against a real-time community agent.
Registration of hosted real-time agents is closed once the arcade is public unless
`PONG_AGENT_REALTIME=open`; `GET /config` reports both kinds under `registration`.

**Evidence.** Forge: seven strategy tests (registration, three refusals, house acceptance, coordinator-
only acceptance, end-to-end against ONYX, five hostile strategies in both modes, two strategies in
Chaos), each shown to fail against a mutation of the rule it covers; 404 tests in all. TypeScript: the
compiled `IPongStrategy` selectors match the service's ABI, vetting refuses each failure with its own
message and never condemns a strategy on a network error, and only a named `InvalidRegistration` is
blamed on the pinned epoch (two mutations caught). Real bytecode on a local anvil
(`npm run test:strategies`): `TrackerStrategy` passes in 2,700 to 6,300 gas a decision, and the
reverting, gas-burning, out-of-range and creator-less contracts are each refused for their own
reason. PostgreSQL and HTTP on the laboratory database: five new checks, fifteen in all.

**On the hosted engine (laboratory 20260918-4, arcade n°4).** Two sample strategies were deployed
before the delegation opened: `TrackerStrategy` (`0xcf34…0670`, dead zone 4 px) and a second one for
another creator (`0xa4bb…ab4e`, 12 px), registered as Tracker and Drifter with `agent-sdk/strategy.ts`
exactly as a creator would, after epoch 2 opened at 15:04 UTC. Both passed the Monad vetting and the
engine rehearsal, were written, and qualified in both modes by real friendly matches (Tracker at
15:17, Drifter at 15:28); both SDK runs exited 0 once qualified. Tracker sent no transaction at all
(nonce 0) and took three points from ONYX, the Expert house bot, in each mode (6–3 Chaos, 4–3
Classic at the time limit). In the league every match with a strategy is ranked, and Drifter beat
NOVA 7–0 in 139 s of Classic.

With three house bots sharing a creator and two strategies, the league pairs a house bot with a
strategy every time: the house bots, playing every third match, are always the ones who have waited
longest. Strategies meet each other once they outnumber the house bots. To prove the one path only
the coordinator can take, the house bots were withheld from admission for a single pairing
(presence set unavailable at 15:58:27 and restored at 16:02:30, no code or gate changed): match 29,
Drifter against Tracker, ranked Classic, was admitted at 16:02:29 and accepted by the coordinator
alone one second later (`accept:29` confirmed), then driven by its burst ticks.

Thirty minutes of league with the strategies in it (15:29–15:59 UTC, one epoch, no unhealthy sample):
266 batches, **532 an hour**, six matches, **zero player inputs**, 312 coordinator transactions (233
ticks, 79 beacons), 1.2 transactions a batch. The house-only league measured 508 and 556: the
strategies added nothing to the batch rate.

**Known limits.** The vetting cannot see a `decide` that writes, which works in a plain call and
always holds under STATICCALL; its qualification match fails instead. A strategy has no memory
between calls. It may read other contracts, but only as they were when the epoch opened. Its
creator can redeploy behind a proxy between epochs, which a hosted agent could always do.

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
62316763, so closing early genuinely clears the counter.

**What seals a batch — corrected by measurement on 2026-09-18.** An earlier version of this page
said the validator seals a batch once it holds `maxDiffsPerCommit` (64) diffs. That is wrong for
the node now serving the arcade. Reading every batch back through `interlude_getBatch`: the first
156 batches carried **320 transactions, 2.05 per batch**, 1 to 6 each, and consecutive batches
began every **0.3 to 1 s** during play. The node seals whatever is pending, about as fast as Monad
settles it. So once there is at least one transaction per sealing window, the batch count follows
*active time*, not the transaction count: one tick a second for one match is about 1.5 batches a
second, which reaches the 1800-batch wall in roughly twenty minutes of continuous play.

The previous node sealed about every 10 s under the same kind of traffic (sampled batches of about
42 transactions), which is why epoch 2 lasted 24 hours before hitting its 8564. Nothing we send
selects the cadence: creating a hosted node posts only `{app}`, and neither the control plane nor
`interlude_session` reports an interval. It is Interlude's to set and it has changed; the arcade has
to be correct under either.

The consequence is that **transactions have to arrive in bursts**, not in a steady stream. The
coordinator ticks every live match on one shared clock, back to back until each is caught up, and
supplies any Chaos beacon inside that same burst for matches only it drives (see *Burst settlement*
below). The house clients' own inputs are gone for league play, since the contract steers those seats.

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

### What real-time play costs, and what it means for opening

Every real-time client sends a transaction at least every sealing window, so it costs about one
batch a second whatever it does. Measured on arcade n°3 on 2026-09-18: one hosted community agent
playing a house bot, about **115 batches a minute**; the whole house league with its seats steered
in the contract, **about 500 an hour** (556 and 508 in two 30-minute runs, and 235 in the 30
minutes after the community agent stopped). The epoch that followed its qualification reached the
1,000-batch roll in **50 minutes**, 765 of them in the first thirteen, while the community agent
still played.

A renewal is not free either. Arcade n°3's first roll under the new node: batch pressure at
13:44:37 UTC, drained and closed at 13:49:36 (1,050 batches), stake released at 14:50:09,
reopened at 14:51:25 and serving again at 14:53:57: **69 minutes** in which nothing plays.
Nearly all of it is the hub's one-hour challenge window, which belongs to the validator's terms.

What follows for a public opening:

- **External agents are strategies** (see *On-chain strategies*): they cost nothing beyond the
  match they play, so any number can register without moving the batch rate.
- **A human challenge ("Play an agent") is real-time.** The human client sends inputs and ticks
  like the community agent did; at the same rate, one epoch holds roughly nine minutes of human
  play before it has to roll, and each roll takes the arcade offline for the time above. The web
  client already extrapolates the court locally, so its 300 ms tick could be spaced out, but real-
  time play stays near one batch a second. This is the open constraint for opening human
  challenges, and it sits with Interlude: the September node sealed about every 10 s and would
  have made the same play cost a tenth as much; a release whose cost did not grow with the batch
  count would remove the ceiling altogether.
- **The human production lifecycle has no batch guard.** `relayer/src/rooms-lifecycle.ts` renews
  only near expiry. At about one batch a second, some twelve minutes of cumulative human play in
  one epoch would put its stake past the release ceiling. It carries no traffic today (epoch 6,
  zero batches) and is untouched by this work; a batch-pressure renewal for it is proposed as a
  separate task.

### Renewals as they actually ran on 2026-09-18

The first renewals under the new node found three defects no test had reached, each in the path
between one epoch and the next.

- **The soak could not survive a renewal.** It froze the manifest and `lifecycle.json` by hash, and a
  renewal rewrites both. It now freezes only what opens the gate (see *Why the 24-hour trial did not
  qualify*). The run on arcade n°3 was kept as an observation instead: 13:05 to 15:10 UTC, 125
  samples, one full renewal inside it, availability 0.44 (55 samples online, 70 draining or renewing),
  two matches at once at its peak, no reverted engine job, Chaos effects 1 to 23 observed. Its
  `sourceUnchanged: false` is real and explained: the keeper was patched nine minutes into the run
  to switch the community agent off.
- **The lifecycle closed under a match being admitted.** In laboratory n°4 admissions closed at
  14:02:36.914, the service created a match 12 ms later from a flag it had read just before, the
  lifecycle's count had already come back empty, and the epoch closed at 14:02:38. The house bots
  then accepted and played on a node whose epoch had ended; all of it was lost with the epoch and
  the match was cancelled at the reopening. The lifecycle now waits until admissions have been shut
  for 60 s, longer than an offer lives, before trusting an empty count.
- **A command lost with its epoch could never be sent again.** Those same bots had signed
  `registerControls` and an acceptance after the close. In epoch 2 the engine handed back the same
  nonces, the bots signed the same bytes, and the shared command journal refused them as already
  resolved, forever: NOVA and PULSE could not accept a single offer, which cancelled two
  qualification matches. Had the old command been committed, the engine would have moved past its
  nonce, so identical bytes in a newer epoch prove it was lost; the refusal is now scoped to the
  epoch. Both bots recovered on restart. The human rooms client uses the same journal and had the
  same latent behaviour.

### The Chaos freeze of 2026-09-18, and the loop that caused it

The first hour on the redeployed arcade froze a Chaos qualification match for good. Two defects in
the steering loop of `PongAgentArcade._advanceState` combined:

1. **The loop condition was inverted.** `while(!complete&&sub<target)` stopped after the first
   100 ms slice that landed, so a tick advanced 100 ms of game time whatever the gap (measured:
   one tick, one slice), and it kept calling the engine with a fresh step budget whenever a slice
   did *not* land. A house match fell behind the block clock, and past 1.6 s of lag `AgentSteer`
   handed the whole gap back to be advanced unsteered, in one call.
2. **Nothing bounded a tick's gas.** Chaos effect 17 costs about **16 M gas per second of play**
   (2.0 M per 100 ms) with no steering at all; effect 16 about 7.3 M; every other effect 1 to
   1.8 M. A game command carries 15 M. On the live node a tick reverted at 14.1 M, the processed
   clock stopped while the block-derived target kept growing, and every later tick needed more:
   an estimate at 100 M still reverts. The arcade caps its clock at the five-minute deadline, so
   such a match never reaches the 30-minute cancellation either.

The loop now slices while each slice lands, the match is still live, and more than the gas reserve
remains (4 M at first, 6 M after review, see below), and reports an incomplete advance when it stops short; the next tick resumes where it
stopped. The phase check is load-bearing: `_finish` reverts on a finished match, so slicing past a
deciding point would make the deciding tick revert. `AgentSteer` no longer returns a long gap whole,
so every catch-up is steered. The registry getters merged into one `agentAt(index)` returning the
agent and the count, which paid for the loop: **24,562 bytes of 24,576**.

`contracts/test/AgentArcade.t.sol` pins it against the real 15 M limit: one tick covers a whole
one-second gap while steering; each of the 24 Chaos effects, with one and two balls, at 0.5, 1 and
3 s gaps, fits and progresses, and a lagging match then catches up and can be conceded; a point that
ends the match inside a catch-up ends it cleanly. Run against the old loop, the effect-17 and
catch-up tests fail, as they must.

An adversarial review of that fix, with its own Forge measurements, found three more ways to the
same freeze, all now closed:

- **Matches with no house seat were not sliced.** `steer` handed their whole gap back, so two
  community agents who went quiet during effect 17 froze exactly like before; the coordinator's
  fallback arrives three seconds late by design. Chaos matches are now sliced whoever plays, without
  touching the control word, so community seats are never steered. The physics is
  partition-invariant, so the result is what one call would have given. A community Classic match is
  still one call: a paddle hit keeps its speed there and 128 events bound the call.
- **The reserve was not a bound.** Chaos multiplies a ball's speed by 1.1 at every paddle hit with no
  ceiling short of a 2^72 representation guard. People miss long before that matters. Two
  near-perfect house bots on a rally that comes back to where the paddles already are do not, and
  past about 25,000 px/s one 100 ms slice holds more collisions than a command can pay for; the same
  slice replays on every retry. **Arcade rule: in Chaos a ball never starts a slice faster than
  3,000 px/s.** `AgentSteer` rescales it before every slice, keeping its direction and every other
  bit of the ball. At that speed a ball crosses the table in about 0.3 s, so a slice holds at most
  one hit. The reserve is now 6 M, which covers the heaviest slice measured at the cap with its call
  overhead, plus the finish. The human game has no such cap and is not affected.
- **A client never ticked after `CatchUpRequired`.** An input that finds the clock behind now sends
  one tick and retries the same intent, in `shared/agent-client.ts`, so both the SDK example and the
  house worker get it. And since a steered house seat no longer sends inputs, it still ticks when its
  opponent is not a house bot: `TickPilot` assumes both clients tick.

Tests added for each, all against a real command's gas: a flat rally already at 1,000, 8,000, 25,000
and 60,000 px/s, alone and with multiball and a gravity well; two quiet community seats through
effects 16 and 17 with one and two balls; the cap keeping direction and every other bit. Run against
the code before the fix, the escalated rally and the community freeze both revert, as they must. Two
fixtures had been testing less than they claimed: assigning one memory struct to another copies the
reference, so every "two-ball" case had been one ball twice. They now copy it.

The human game shares the Chaos flow and survives effect 17 only because its clients tick every
300 ms. Whether a lapse in its ticking can freeze a human match is being checked separately and
read-only; nothing here changes the human contract.

### Burst settlement

Because the node seals whatever is pending every fraction of a second, the coordinator no longer
ticks a match whenever its progress is 1.5 s old. On one shared clock (`PONG_AGENT_TICK_MS`,
default 10 s) it takes every match nobody else has advanced for three seconds and, back to back:
supplies a due Chaos beacon, ticks, reads the state back, and repeats until the processed clock is
within one second of the block clock, a tick makes no progress, or twelve passes. A stall on a draw
whose drand round is not out yet ends the burst instead of spending ticks on it; the draw then waits
at most one period and the next burst replays the whole gap, so no lag accumulates. A match a
community agent is driving still gets its beacon at once.

### The steered Classic seats never moved

The first league games on the second redeployment were implausible: ONYX beat PULSE 7-6 in 35 s of
play, a point every 2.7 s, where the same pairing played by the off-chain bots averaged 14.7 s a
point over 258 matches. Reproduced in Forge exactly: both paddles sat at 288 from the first tick to
the last. The loop read the match state *before* `steer` wrote its decision; Classic advances the
directions it is handed and saves the state back, control word included, so every slice advanced the
old directions and then erased the new ones. No house seat had ever moved in Classic since the policy
went on chain; only qualification inputs moved a Classic paddle. Chaos was unaffected, because its
engine reads the control word from storage. The state is now read after `steer`, and a steered
ONYX-PULSE Classic match holds its rallies. Every earlier steering test had stopped right after `steer`
wrote a direction; two new tests check that the decision survives an advance, in both modes.

Watching real rallies also showed that the arcade's Classic rules speed up by 1.1 per hit with no
ceiling (192 to 970 px/s within 41 s), so the 3,000 px/s cap covers both modes.

### What the hosted node accepts, and what that does to batches

- **A transaction is capped at 30,000,000 gas.** The node refuses anything above it before execution
  ("transaction gas limit is greater than the cap"); estimates are not capped, so an estimate is no
  guide. Ticks and beacons, the commands that catch a match up, now carry 30 M; everything else keeps
  a player command's 15 M. A lagging Chaos match caught up at 24.2 M a tick, the contract stopping each
  advance on its 6 M reserve.
- **A command refused before execution used to block its signer for good.** The writer kept it as
  uncertain and replayed the same bytes forever. It now retires exactly that case, when the node says
  it rejected the transaction before execution and the chain confirms the nonce unused.
- **Qualification inputs stop at the rule.** A qualification match needs at least five inputs, two of
  them after the reconnect. The house worker used to send them for the whole match, which cost 285
  batches in two minutes; it now stops one past each threshold and lets the contract steer.

Measured on the current deployment over thirty minutes of league play only (31 samples, none
unhealthy, one epoch, no qualification in the window), at a 10 s burst cadence:

| | value |
|---|---|
| batches | 278, **556 an hour** |
| league matches completed | 5 (3 Classic, 2 Chaos), 55.6 batches each |
| coordinator transactions | 300: 228 ticks, 72 beacons, **1.1 per batch** |
| player inputs | 0, read from the seats' nonces |

At that rate a 1000-batch epoch lasts about 1 h 50 of play. For comparison, the second redeployment
with 15 M ticks made about 1,370 an hour, and the previous arcade's off-chain bots would make several
thousand on this node. A Chaos burst is a beacon and one to four ticks sent about 0.75 s apart, each in
a sealing window of its own; a Chaos match costs about one transaction per four seconds of play
whatever the burst cadence, so the cadence is not the lever for Chaos. Send latency is.

A second thirty-minute window with the writer's delegation read cached for five seconds gave 254
batches, **508 an hour**, 1.2 transactions per batch, over three Classic and three Chaos matches. Per
five-minute match: Classic about 30 transactions (one tick per burst), Chaos 70 to 80 (40 to 59 ticks
and about 25 beacons, one per effect draw).

Two further levers are measured and deliberately not engaged, because each trades something away:

- **Chaos slices of 200 ms.** Steered Chaos costs 3.91 M gas per second of play at 100 ms slices and
  2.03 M at 200 ms (Forge, one 30 M tick after a 5 s gap, eight rounds), so a tick covers about 12 s
  instead of 6 and a Chaos match needs half the ticks. The price is coarser play: ONYX's 85 ms
  reaction would act at 200 ms. It changes the library, so it needs a new deployment.
- **A 30 s burst cadence.** It does nothing for Chaos, which is gas-bound, but cuts Classic from about
  30 transactions a match to about 10. The price is a spectator frame every 30 s instead of every 10.

Together they would bring the league to roughly 300 batches an hour, about 3 h 20 per 1000-batch
epoch. Smooth spectating at any of these cadences needs the client to replay the deterministic
simulation between frames, which it does not do yet.

Retiring the frozen deployment: its `closeEngine` refuses while it counts a live game, and that game
cannot move. `scripts/retire-stuck-agent-arcade.ts` proves both, then closes it through the hub's
liveness escape `forceClose` once that is legitimately open (an hour without a commit, or past the
session's maximum duration) and releases the stake, which is reserved from the validator's own bond.
It refuses to close anything whose stake could not be released afterwards, and anything still named
current in `deployments/agents.json`.

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

## In-tournament learning

House bots adapt within a tournament and start each new one at their published difficulty. The
design below is what a three-way study converged on; the parts that matter are the ones that make
it cheap and the ones that keep the ladder honest.

**A tournament is one delegation epoch.** Field 31 is stamped exactly once per match at acceptance
by `PongChaosEvents._save` and already surfaces as `gameEpoch(id)`. Reading it costs one SLOAD and
no new argument. The reset is not a sweep: the epoch sits inside the key preimage, so a new epoch
yields a key that has never been written, reads zero, and decodes as "play the label". Nothing to
clear, nothing to migrate, nothing that can be half-done. `epoch == 0` means no learning at all, so
a scoping bug fails toward the advertised difficulty and can never quietly make the arcade easier.

**One word per rival pair, per mode, per tournament**, in namespace 5 so it cannot alias a match id
or an agent index. It holds two 96-bit seat records of deltas from the tier constants, so the
all-zero word decodes to exactly the published difficulty and a fresh tournament needs no
initialisation write.

**At most thirteen writes per match, one per point resolved.** Both seats live in the same word, so
a point costs one write even though both learn from it. There is no per-tick write, no per-slice
write, no aim-error write, no end-of-match write and no tournament-boundary write.

**The attribution comes from the slice loop, not from storage.** When a slice returns a state whose
score moved, the state at the start of that slice is still in memory, and so is the aim the
conceding seat committed to. The bot asks the one question it can actually answer: was I beaten
because I was late, or because I was wrong? Four integrators accumulate the answer, each needing
six to eight consistent samples before it moves a parameter, so noise cancels and only systematic
error survives.

**The fairness law.** The two strength dials, decision interval and dead zone, are one-sided: a bot
starts at its label and can only move to the soft side of it. Conceding recovers it toward the
label and stops there; scoring on it eases it off. So scoring on a bot is the only thing that makes
it harder, and it can never become harder than advertised. No existing rating is retroactively
devalued by a bot that got better than the thing someone beat. The aim error, the strongest
signature of a tier, is not learnable at all. Only the aim bias and the extrapolation gain are
two-sided, because they correct a model error the label never intended to include rather than
tuning a difficulty.

**Learning is off on ranked matches.** ELO assumes stationary strength on both sides and an
adapting bot is non-stationary by construction, with the provisional K of 64 landing exactly where
adaptation is fastest. One bit of a read already being made. Ranked matches play the published
label exactly, and the ladder measures a fixed, public opponent. Today this changes nothing, since
all three house bots share one creator key and `ranked` requires two distinct creators, so no
house-versus-house match has ever moved a rating word — but the day those keys are split, the
conflict would arrive silently.

### What has to be checked before any of this is written

**The slice loop is root code and it does not currently fit.** Measured: a steering loop in
`PongAgentArcade._advanceState` costs 384 bytes against the 324 available, so the contract lands at
24,636 of 24,576. The learning mechanism itself costs zero root bytes because it lives inside the
linked library; the loop does not. Either the library drives the advance, taking `physicsRules`,
`chaosEngine` and `hub`, or headroom is bought back by moving view helpers out. Neither is measured.
Note that `physicsRules` and `hub` are public immutables and so reachable from library code for
free, while `chaosEngine` is internal and is not.

**Whether repeated writes to one slot collapse to one diff is settled, by measurement.** Three real
`commit` transactions of this application were fetched from Monad and their calldata decoded
(`0xdad4e3cf`, `0xbbff2731`, `0xd7975177`, blocks 62400019 to 62400085, batches 2490 to 2492):

| batch | transactions | diff entries | distinct slots | repeated |
|---|---|---|---|---|
| 2490 | 46 | 8 | 8 | 0 |
| 2491 | 39 | 8 | 8 | 0 |
| 2492 | 46 | 8 | 8 | 0 |

Forty-six transactions touching the same eight slots commit exactly eight `SlotDiff` entries, and a
slot never appears twice. Writes are collapsed to a net change per slot per batch, so a slice loop
is free in batch terms — whether it writes a slot twice or thirty times, inside one transaction or
across forty. **Chaos can therefore slice and learn exactly like Classic**, and the repeated
`store()` rounds that `ChaosGameFlow.advance` performs cost nothing extra.

This also corrects an inference recorded earlier in this file. The figure of about 1.5 diffs per
transaction was derived by assuming a batch seals at the 64-diff cap. It does not: these batches
carry eight diffs against a cap of 64, and the real rate is **0.17 to 0.21 diffs per transaction**.
Neither `maxDiffsPerCommit` at 64 nor `maxBatchInterval` at 3600 seconds is what closes them — the
node seals on its own transaction or time boundary, at about 43 transactions per batch across
seventeen sampled batches.

**The consequence is that batch production tracks transaction count, not state churn.** Epoch 2's
8,564 batches over roughly 364,000 execution transactions is 42.5 per batch, matching the samples.
Staying under the 1,800-batch release ceiling therefore means staying under about 77,000
transactions per epoch. On-chain house bots at a five-second tick put a 24-hour epoch near 31,000
transactions, or roughly 730 batches — under the ceiling with room, and for the right reason.

**The direction bits are read by more than the physics.** Field 8 carries the direction pairs, the
score and both input nonces; it is consumed by the codec, passed into `ChaosEngine.advance`, emitted
in the `Snapshot` event and decoded by the client. A direction that lives only in memory is silently
discarded by the next transaction's read. It must be written once per transaction, change-guarded,
at the end of the slice loop. Note also that `_finish` zeroes both direction fields, so attribution
on the match-winning point must take its last direction from memory, not from a post-goal read.

### Two things to say plainly before anyone watches this run

Moving the policy inside `_advanceState` deletes snapshot staleness and clock extrapolation, so the
bots get strictly better before a single thing is learned. **Every win rate and every qualification
threshold calibrated against the off-chain bots is void.** The soak has to run with learning
disabled first and then enabled, or the two effects cannot be separated.

And the policy models two walls and nothing else. Curveball rotates the velocity, gravity well bends
it, solar wind accelerates it, bank shot rescales the slope, and pinball, portals, ricochet,
breakout, warp lane, last chance and mystery pickup all divert the ball. The TypeScript original is
equally blind, so this is inherited rather than introduced, and the gain integrator recovers only
the multiplicative part. The bots will visibly improve at what the policy can see and stay
structurally blind to roughly half the Chaos catalogue. Raising that ceiling needs a richer policy,
which needs bytes this deployment does not have.
