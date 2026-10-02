# Synchronization release — 2 October 2026

## Checkpoint, 16:51 UTC — hosted Classic pause and cancellation pass

Published commits `f31eff0`, `b1f72ee`, `cdde076` and `8d817a0` contain the
candidate, its packaging correction, a control-cache freshness correction, and
the bounded hosted synchronization driver. Production remains unchanged.

The first image omitted `tsx` because it inherited production dependency
selection. Its actual isolated physics process failed before any game. The
failure log, image identity and container state are retained in
`sync-f31eff0/evidence/packaging-failed` on the VPS and in local
`artifacts/sync-vps-20261002`. Only that unusable new image and its exited process
were removed. The corrected image explicitly includes the locked development
runtime and checks the TypeScript loader during build. Image `pongit:sync-b1f72ee`
is `sha256:d094058851277aaf42566f72390cd20bfb516848397c89bc02b88b9f3a136fe1`.
The first build command's unsupported Docker flag is a separate retained failed
attempt. Actual filesystem usage was 79.374 percent before the corrected build.

On this image, isolated VPS Anvil comparisons passed 10,000 Classic cases and
24,000 Chaos cases: 10,000 random, 10,000 simultaneous-contact cases and 4,000
legacy compatibility cases. No mismatch occurred. These are physical-module
comparisons, not browser or final full-service acceptance. Reports are copied
locally under `artifacts/sync-vps-20261002`.

The control cache regression was reproduced: a state aged 550 ms could be reused
because spectator reads permit 600 ms, or ten seconds between points. That stale
state then failed the control heartbeat's 500-ms check. Command reads now obtain
a fresh authoritative observation instead. The reproducer first failed, then all
65 focused transport/feed/player/projection tests and root typecheck passed.

Fresh PRIVATE season: `reusable-agents-20261002-1`, pool
`0xd47bc7fece722a237c6547f85b4dd91c2601a4c8`. This is never a substitute for public
migration/history. The five new rules-16 arenas are recorded in
`sync-games-b1f72ee/evidence/agents-deployment.json`. Only
`0x16420bcbb68b4bda117540dea0af3e8c6b1bd44c` is opened, epoch 1; the other four
remain unopened. Its hosted state-changing publication preflight passed before
the first admission. Public gates remain false.

Actual Classic qualification match 1 finished 0-7 after 138.782151 seconds of
physical play. Its result was captured at 16:45:40 UTC. NOVA and ONYX gained the
Classic technical qualification from that published result. The controller trial
passed and closed its admissions normally.

Actual friendly Classic match 2 used a synthetic owner and the real scoped player
client, with the `cdde076` feed correction mounted explicitly in that PRIVATE
driver. One hundred commands had confirmation p95 117.98 ms from the VPS. During
the deliberate input outage, physical time stopped at 7.210000 seconds and score
1-1. Eight further observations across 3.585 seconds had the identical physical
digest while the independent engine worker continued. Resume was committed for
engine block 36907, exactly 300 blocks later; play resumed at block 36912 after
3.082 seconds, preserving the frozen physical time. A second, prolonged outage
then produced cancellation status 4 and zero winner. The result was published
and captured; competitive rating remained 1000 with zero played/wins. The driver
exited successfully and closed its private gates. This is not browser/GPU/Mera or
real catalogue latency evidence.

Runtime: `/opt/pongit/tests/fluid-20260928/sync-games-b1f72ee`. The only engine and
archive workers are `pongit-sync-workers-20261002-engines-1` and `-archive-1`,
bounded by their original 3,000-second timeout from about 16:41 UTC. Read
`worker-plan.json` for the exact deadline; never extend it or duplicate writers.
At this checkpoint, only `pongit-sync-controllers-2-b1f72ee` is the active game
driver, with original deadline about 17:04:51 UTC. It must qualify Chaos before
the separate human-controller Chaos test. Inspect its report before another
admission. No autonomous matchmaking/maintenance opener is running for this pool.

At canonical block 67591382, the original operator held 438.839452374 test MON
and the v3 publication account held 47,911.471029623516479201 test MON. The opening
fee remained 0.01 MON. Four scoped private roles received five MON each through
the original operator journal. No new funding request. Source preflight checked
32 linked modules before deployment and found no pending operator transaction.

Backup `sync-20261002T1632Z` contains operator/public-agent/private-v3 dumps and
runtime/key configurations; all five files were copied off VPS and SHA256
verified. Its name is a label; the manifest records the actual creation time.
The post-deployment backup `sync-20261002T1650Z` is being created and adds the new
private database and its keys/state. Verify its off-VPS copy before relying on it.
Preserve the existing nonce authorities and every earlier failure. The browser
startup approval rejection and remaining release gates below are still open.

## Checkpoint, 16:14 UTC — local candidate verified, no public deployment

The implementation below now includes the rules-16 contract, atomic reads and
events, participant input timeline, deterministic official-bot projection, pause
and resume display, archive/index/version compatibility, and explicit private
deployment/migration options. Existing immutable arenas are not relabeled.
Production remains unchanged. No hosted rules-16 game or new browser run has
passed. The unchanged 24-hour release trial has not started.

The browser draws the player paddle and ball from the same simulation. A
contractual pause also caps the stored presentation clock; otherwise time hidden
behind the pause would cause a jump when the limit was raised on resume. A
regression test covers that case. The house-policy mirror was compared against
actual local EVM calls 20,000 times (10,000 existing, 10,000 progressive), with
2,500 observations per archetype and no mismatch. This is not evidence of human
win rates or browser rendering performance.

Interlude SDK and CLI 0.2.2 are the current npm versions, verified on 2 October.
The [official changelog](https://raw.githubusercontent.com/Veenoway/interlude-sdk/main/sdk/CHANGELOG.md)
describes its recoverable send router. Rules-16 players use that router with a
four-second transport bound and the existing signed-command journal. A missing
response never triggers a transport retry or releases the nonce. A real local
WebSocket test passed the timeout/no-retry assertion but initially left a socket
alive; that attempt was stopped and retained. The corrected transport releases
its last owner's sockets. All 11 transport tests then passed and exited normally.

The final complete Solidity run passed 935 tests; eight tests requiring explicit
fork/external setup were skipped, not passed. The earlier complete run failed two
pool bytecode-budget assertions. One duplicated rules getter was removed and the
original budgets were retained. The linked candidate graph now passes:
`ProvisionedSynchronizedAgentArena` 24,165 bytes, `ReusableAgentGame` 21,735,
`ContinuingFiveLaneAgentPool` 32,757. The latter has only 11 bytes of remaining
reviewed budget. Do not increase its allowance to accommodate a later change.
The TypeScript suite passes 917 tests, root typecheck is clean, and the Next
production build passes. No browser server was started.

The additive rules-16 SQL migration was applied twice in disposable database
`sync_archive_20261002` inside `pongit-result-archive-test-db`. Both legacy tables
retained their row digests, accepted version 16, and rejected version 17. No public
database schema was changed. The disposable database is retained for inspection.
Evidence scripts/reports are under local `artifacts/sync-*` and
`artifacts/agents/house-policy-mirror-*`; failing reports are preserved.

Disk was 82 percent. Forty-nine source-transfer archives (2,133,631,668 bytes)
were copied to `C:/Users/wwwle/.codex/private-backups/pongit/source-archives-20261002`
and SHA256 verified before their exact VPS files were removed. The cleanup
verified paths beneath `/opt/pongit/tests`, no archive mount, and no running
command referencing those archives. Sources, images, containers, volumes,
backups, runtime configurations and failed reports remain. Disk is now 79 percent.
The off-VPS manifest and its VPS copy retain every original path and hash.

Next: finish the candidate image and isolated physics tests, qualify rules 16
without modifying production, and complete actual controls/admission, all modes,
community/tournaments, simultaneous lanes, publication/release reserve, migration,
financial/replay and final unchanged 24-hour gates. The prior automatic approval
rejection of the rebuilt local Next server remains unresolved. Do not bypass it
with an alternate server launch; browser/GPU/input acceptance remains outstanding.
No new funding request. Necessary test-MON spending is already authorized.

## Checkpoint, 15:12 UTC — implementation in progress

The user approved the complete synchronization plan and necessary test-MON spending.
Production has not changed during this operation. The candidate is based on published
`bc76782`; the rules-16, player projection, input ledger and warm-up changes are still
uncommitted. They are not qualified for production. No subagents or duplicate writers.

The previous continuation prompt was stale: private Classic championship 3 completed
28/28 at 13:02:17.982 UTC on 1 October. Its driver exited successfully before its
original deadline. The private tournament engine/archive workers subsequently stopped
at their original 14:12:44.453 UTC bound. The 2 October running-container inventory
contains no private v3 trial driver or engine. Do not restart expired configurations.
The fresh private `550f` season remains separate from public history. Its prepared
continuation is still unimported. Championship 4 and all final release gates remain.

## Implemented locally

- Pinned Interlude SDK and CLI to 0.2.2. Custom transport integration still needs
  review: merely changing the package does not activate its send router.
- Reproduced the paddle/ball disagreement and added coherent participant projection:
  the ball and paddle use the same timed intentions and collision model.
- Added a per-match input presentation ledger. Acceptance time and applied physical
  time remain distinct. The signed-command journal retains ownership of nonces.
- Added a monotonic local warm-up timer, paused while the document is hidden.
- Added immutable rules 16, with protected friendly human/official-house matches:
  500-ms heartbeat credit, physical catch-up capped at that credit, three-second
  resume countdown, and cancellation with zero winner after 30 seconds of outage.
  Historical rules 15 and bot tournaments retain their own behavior.
- Added synchronization snapshots/events, compact heartbeat methods and client
  plumbing. Browser pause presentation and exact house-policy projection are not
  finished. A TypeScript policy mirror exists but is not yet integrated or qualified.

## Evidence and limits

Eleven warm-up/projection tests passed, then 58 focused player/feed/projection tests.
Root typecheck passed before the latest synchronization/controller fields. Thirty-seven
targeted Solidity tests passed before the latest event schema additions. The latest
schema still needs ABI regeneration, typecheck and regression runs. No new browser,
GPU, real hosted rules-16, admission-latency or 24-hour proof exists.

The earlier automatic approval review rejected local rebuilt Next startup with
`blocked by policy`. Do not bypass that rejection through another launch route.
Existing failed admission (9.9–11.1 seconds) and browser hold (800/616 ms) measurements
remain failures. The separate read-only projection sample is not browser evidence.

## Next work and preservation

Finish participant recovery UI, deterministic policy projection, nonce/heartbeat tests,
SDK transport and mixed-version readers/indexing/deployment. Then run actual bounded
qualification, compatibility-safe migration and the unchanged 24-hour trial before
cutover. Preserve all failed reports, source seasons, historical routes and balances.

Use the original operator database `pong_relayer`, `il_lifecycle_jobs`, advisory lock
701340 and `lifecycle.json`; keep scoped signer journals and engine lock 701349.
Never use human arenas for bots or add Monad gameplay fallback. Recheck disk (last
81 percent) and perform scoped cleanup below 80 percent before any image build.
The last verified off-VPS backup is `control-20261001T1107Z`; refresh and restore-test
backups before deployment. No new funding request has been justified.
