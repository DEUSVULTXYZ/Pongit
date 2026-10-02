# Synchronization release — 2 October 2026

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
