# Agent UI and spectator playout, 21 September 2026

## Scope

The user reported freezes while watching bots, a different visual identity in
Agent Arcade, and house bots remaining unavailable during tournaments. The
changes below address observation, rendering and presentation. They do not
silently activate the private house-instance authority or erase the public season.

Product commits: `c4a7461`, `945b03a`, `e566b7d` on
`codex/arcade-release-20260919`. Root TypeScript and all 655 TypeScript tests pass.
The production webpack build passes. Staged secret scans pass.

## Causes and corrections

* A Chaos spectator projected at most 600 ms from an old sample even when its
  playout buffer already contained a later processed state. Incremental
  projection now traverses the confirmed interval with bounded work per frame.
  Player prediction retains its existing safety bound. An anticipated goal
  never awards points or creates a new rally without the actual state.
* Increasing the adaptive delay could stop the monotonic playout clock. It now
  approaches the new delay gradually, never running beyond received game time.
* The observer stopped accepting WebSocket frames at its ten-second identity
  deadline, then performed sequential session and rules reads. Those checks now
  run concurrently and are prefetched before expiry. The original expiry stays
  enforced. Failure invalidates the observation immediately; retry is bounded.
* Periodic hub and admission reads stopped the bot tick loop. Their unchanged
  five/ten-second validity bounds now have background refresh. Initial and
  expired reads still wait. Every write retains the independent engine epoch,
  permission, hosted-session and durable-nonce checks.

Agent pages reuse the human cabinet classes, frame assets, scoreboard, fonts,
controls, sound toggle and background. Mobile headers and score modules are
compact. The effects HUD keeps its fixed space. A stalled spectator says
`Synchronizing live match`; it is not represented as fresh live progress.

## Real render evidence

All measurements use real public API, hosted engine and WebSocket data. Only
candidate HTML/assets are routed to an isolated container. They involve no
synthetic game state, no signing and no additional game driver.

The first 60-second Chaos window on candidate `c4a7461`, match 76, epoch 3,
arena `0x7fb78a8fbfd597daadbe6971c106720eb1510d7d`, **failed**: 85.29% moving
frames, p95 frame interval 17.9 ms and maximum stationary interval 2,116.5 ms.
Diagnostics show the playhead repeatedly reaching an unchanged processed state.
This was not a graphics frame-rate failure. Periodic validation and engine
maintenance were then corrected; this report is preserved, not replaced.

Chrome's subsequent 60-second real Chaos window, match 78 in the same epoch,
passed: 3,593 samples, 98.86% inside-court ball samples, 89.25% moving frames,
p95 interval 18.7 ms, maximum stationary interval 881.5 ms. No page errors.
This is a bounded observation, not a guarantee of zero pauses, a controlled
identical-rally benchmark, or the required unchanged 24-hour qualification.

Edge's separate 60-second window of that same real match also passed: 99.10%
inside-court ball samples, 88.76% moving frames, p95 interval 18.1 ms, maximum
stationary interval 1,383.8 ms. Short pauses are still measurable; none of these
results establish uninterrupted service or a fixed provider quota.

After deployment, an additional Chrome window used public HTML/assets directly
(no proxy): real Chaos match 79, same arena/epoch, 60 seconds, 99.97% inside-court
samples, 92.67% moving frames, p95 interval 17.9 ms and maximum stationary
interval 1,032.3 ms. It passed with no page errors. Its run is
`public-e566b7d-1-chrome`.

Chrome's isolated UI suite passed all 27 checks at 360, 390, 768 and 1440 px,
plus 844 px landscape. It covers both courts, all 24 effect HUDs without layout
shifts, catalogue, both tournament layouts, keyboard/focus, dialogs and retired
replays. The suite uses actual built assets with synthetic API and chain state;
it is not a real authenticated human-bot game. Mobile and desktop screenshots
were also visually inspected.

Edge passed the same 27 UI checks. These 54 successful checks are separate from
the two real spectator windows above.

Paths on the VPS:

* `/opt/pongit/tests/arcade-release-20260919/agent-polish-c4a7461`
* `/opt/pongit/tests/arcade-release-20260919/agent-polish-945b03a`
* `/opt/pongit/tests/arcade-release-20260919/agent-polish-e566b7d`

Each actual render report is under `diagnostics/agent-spectator`. Failed build,
fixture and live-selection attempts remain distinct. In particular, selecting
a just-finished match and finding no live Chaos during rotation failed their
original deadlines; these are not recorded as successful rendering tests.

## Operations and rollback

At 19:01 UTC, while both public arenas were idle, only the public agent engine
was recreated. Its `spectator-b80bee9` image remains unchanged, with the engine
script mounted from `agent-polish-e566b7d`. Other publication-guard mounts stay.
The keeper, operator journal, bot identities, databases and human game were not
replaced. Existing uncertain commands remain in the same journal.

Backup `agent-polish-20260921T1859Z` preserves both Compose configurations, the
private container configuration, agent database and previous engine overrides.
All six files were SHA-256 verified off VPS under the user's protected SSH
backup directory. They are not repository artifacts.

Engine rollback restores only its previous script mount from
`publication-f30eb5a`, then recreates that service alone. It must not restore an
older database or overwrite newer keeper/indexer Compose changes.

The old public web image `pongit-web:spectator-fa7a5b1` is retained. Candidate
images and failed reports remain available. Human backend `e4eceb6` stays open;
agents and tournaments remain explicitly unqualified testnet preview.

At 19:09 UTC the public web container was recreated with
`pongit-web:agent-polish-e566b7d`. Only its image entry changed in the existing
Compose override. Root, agents, tournaments, docs and both configuration APIs
returned HTTP 200; public Agent Arcade HTML contains the shared cabinet class.
The human admission gate stays true. Roll back by restoring that single web
image to `spectator-fa7a5b1`, then recreating only `web`, without rebuilding or
restoring databases.

### Idle arenas delayed by archive maintenance

Keeper logs show eight successive `captureProof` operations from 19:08:34 to
19:11:37 before `admitTournament` at 19:12:21, while the arena service reported
both arenas available. This is separate from motion within a playing match.

Commit `3680db2` moves the bounded old archive scan after actionable admissions.
Current lane capture, uncertain-operation reconciliation, delegation recovery,
rating rebuilds and current tournament advancement still precede admission.
Historical scans also run when budgets or admissions are unavailable, and while
the lanes are occupied; their durable cursor and all proof checks remain.
Each keeper step still submits at most one operation. Root TypeScript and 13
targeted maintenance, recovery and budget tests passed for this change.

After SHA-verified off-VPS backup `agent-scheduler-20260921T1915Z`, only the
public keeper's script mount was replaced by `keeper-priority-3680db2` and that
service recreated. Its original operator database, advisory lock, nonce journal,
state directory and exclusion of retired arena `1c5…` remain. The backup includes
operator and agent dumps and private journals; it must never be published.
Rollback restores only the previous `keeper-retirement-0116c96` script mount,
not an older journal. Its first observed transition then completed through
`captureProof` at 19:17:54, `synchronize` at 19:18:17 and `admitTournament` at
19:18:49 (steps 442–444). Championship 4 advanced to 21/28 resolved fixtures.
That is about 55 seconds from capture to admission in this observation, versus
the earlier archive run's nearly four minutes. This is not an equal-load
benchmark or a promise of instant matchmaking. Candidate smoke web containers
were stopped after the actual public verification; images and reports remain.

## House instances remain a separate migration

The algorithm and competitive identity were coupled in the old immutable pool.
The private `ReusableAgentInstancesPool` gives each friendly match its own
controller state and does not acquire the archetype's tournament lock. It has
passed sequential hosted controller trials, but simultaneous hosted copies,
actual browser play and preservation of the existing public season still need
qualification. Do not switch the public manifest to its fresh private season.

An archetype can be copied; its matches still need real execution capacity.
The current two agent lanes are not unlimited concurrent hosting. See
[house-instance evidence](agent-instances-20260921.md) and
[migration work](agent-migration-indexer-20260921.md).
