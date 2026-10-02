# Synchronization release — 2 October 2026

## Checkpoint, 22:02 UTC — human v3 compatibility and retained replay proof

Published `d88b480` adds pinned v3 no-lease support to the candidate human
arena, lobby, attestation, lifecycle, pool, progress loop and browser session.
Unknown zero-expiry hubs remain inadmissible. Active games cannot be closed
as expired just because v3 reports zero; epoch/status, publication deadlines,
player grants and measured batch reserve remain enforced. Existing positive
lease behavior is retained. Tests: 929 TypeScript, root typecheck, 103 targeted
Solidity and a complete Next build pass. The first new Solidity test attempted
to concede during loading and failed; after actual ready/countdown/start the
corrected test passes. Arena runtime is 24,315 bytes; lobby is 29,632 bytes,
within their existing reviewed limits. No human contract has been deployed.

Published `2c8e025` additionally pins v3 human node origins, prevents changing
hub on a journalled deployment, and makes voluntary rotation check its own
hub's control/validator rather than accepting arbitrary HTTP rejection from
the newest origin. Forty focused tests and root typecheck pass afterward.
Fresh private v3 deployment requires explicit `isolated-testnet` and rules 14;
this path refuses a migration snapshot. Thirty compiled artifacts are staged
and SHA-verified at `sync-human-v3-2c8e025`, not deployed or opened. The initial
local packaging attempt misunderstood the preflight return shape and stopped
before copying or chain writes; its empty staging directory was verified before
retry. Archive SHA256:
`9aeb04e763be7c1d970688df4937cd0197995168f034e6039e103faf21d0b387`.

Read-only replay verifier `94507a4` passed at 21:51:53, canonical block 67655067.
Twenty-nine actually retained replays from both private seasons have matching
contract result hashes, final scores, players and decoded ordered frames. The
real private Hasura retention query succeeds. This is not browser playback or
public migration. Evidence: `evidence/sync-replays-1.json`. Source and target
replay databases remain separate and unchanged by this read-only verifier.
For a public migration, retain its existing shared replay database and historical
routes; do not copy these private fixture histories into it.

Private indexing is finished and stopped early after both verification gates.
Indexer attempt 2 exited 143 on TERM at 21:59:30; private Hasura exceeded its
30-second shutdown grace and exited 137 at 22:00:00, `OOMKilled=false`. Preserve
that distinction and its earlier read-only-filesystem failure. Both databases
and all reports remain; no restart is requested. Backup `sync-20261002T2150Z`
has eleven off-VPS SHA-verified files, including private index/runtime and
concurrent-player keys. Manifest SHA256:
`dc4b148cdefae0e3f310b0d236f710369c82ae770930e874f7bed06c867e6342`.
Later verification/stop reports need inclusion in the next refresh.

Tournament 3 remains the only game driver; twenty fixtures were resolved at
21:57. Its original 23:37:46 deadline and worker 02:36:56 deadline are unchanged.
No production mutation, public migration, extra game writer, final 24-hour
trial or complete release is claimed. Legacy hosting and pending browser
startup approval remain the external obstacles already documented.

## Checkpoint, 21:38 UTC — optimized simultaneous copies and canonical index pass

The private optimized copy trial 3 passed at 21:19:52 UTC: one competitive
fixture and four independent friendly copies of the same official archetype
were observed concurrently for 17,039 ms. Both modes were covered; each human
controller sent 100 acknowledged controls. VPS p95 command times were
140.87, 140.85, 124.42 and 160.77 ms. All five results were published. The earlier
trial 1 missing-terminal-timestamp failure and trial 2 between-fixture launch
failure remain separate; neither was relabelled. No browser or seven-way proof.
Evidence: `sync-continuation-20261002/evidence/five-concurrent-3.json`.

Index configuration commit `277438f` fixes rules-16 manifests being emitted as
rules 15. Its regression fails before and passes after the change; 15 focused
tests and root typecheck pass. Isolated image
`sha256:ec33806c2ac31aeaaf37c26c2a299e1809ef9ba4abeaa009d5b17583ae226d24`
was built from a pinned base with actual Envio generation and typecheck. It
indexes only private d47 and dee98 seasons into `pong_sync_index_20261002`.
First startup failed on a read-only `.envio` directory before processing;
attempt 2 supplies a bounded tmpfs and preserves the original **22:04:40 UTC**
deadline. Active indexer `pongit-sync-index-20261002-attempt2`; stop its private
Hasura `pongit-sync-index-20261002-hasura-1` after completion. No public index
or database changed.

Read-only canonical verifier `940eaa5` passed at 21:31:39, block 67650987. All
55 indexed results match contract state at that exact processed block, with
rules 16 and cross-season latest-three replay retention (22 players, 31 retained
matches). This does not prove historical replay-frame migration or browser
playback. Report: `evidence/sync-index-1.json`.

Classic championship 3 remains active: 15/28 resolved at 21:37. Original driver
deadline **23:37:46.598862 UTC**, original engine/archive deadline **3 October
02:36:56.853276 UTC**. Do not duplicate or extend. All copy drivers are stopped.
Tournament 4 can start only after actual tournament-3 success and sufficient
remaining original worker time. New no-lease human compatibility defects were
identified in candidate arena/lobby expiry checks; no such patch or deployment
has occurred yet. Production remains unchanged; legacy hosting and pending
local browser approval remain unresolved.

Backup2105 is SHA-verified off VPS. Later copy evidence, private keys and the new
index database still need a refreshed backup. Scoped cleanup archived four
obsolete build contexts off VPS and removed only verified copies, leaving disk
79.72 percent before the new index image. Preserve rollback, runtime and failed
reports. No final qualification or public delivery claim.

## Checkpoint, 21:00 UTC — legacy hosting failure confirmed; bounded copy trial prepared

Read-only 45-second requests confirm HTTP 503 from the legacy control origin
and both tested legacy human/agent engine origins, after 36.8–37.1 seconds.
IPv4 TLS completes normally before the server wait. This is distinct from a
browser delay, funding failure or a provider-capacity measurement. The current
v3 control responds and the five optimized private engines publish normally.
No public restart, session recreation, gate change or credential guess occurred.
Evidence lives under `sync-continuation-20261002/evidence/` as
`public-legacy-long-read.json`, `public-legacy-transport.json` and
`public-human-read.json`. Public tournament 23 remains unfinished; its source
locks and results must be preserved, not silently cancelled for migration.

Private Classic championship 3 remains the sole tournament driver, with its
original 23:37:46.598862 UTC deadline. Engine/archive retain their original
3 October 02:36:56.853276 UTC bound. Inspect their reports before any launch.
The read-only optimized Classic clock passed at 98.5205 percent; optimized
Chaos and browser rendering remain unproved. Historical failures stay intact.

Qualification commit `a226e50` permits four independently keyed synthetic
friendly copies alongside that existing private championship. It does not own
the tournament, pool or arena gates and never starts another tournament driver.
Account setup precedes the loading deadline; atomic challenge admissions are
resolved from actual lane records instead of assuming a separate admission.
The fixture checks a real five-engine overlap and 100 acknowledged controls
per player. Root typecheck and 49 focused tests pass. It has not yet run on the
hosted candidate. Its forthcoming bound must be recorded before launch.

The explicit browser-server question remains unanswered after automatic review
rejected local Next startup. No alternate launch is permitted. Production is
unchanged; no completed public release or unchanged 24-hour proof is claimed.

## Checkpoint, 20:46 UTC — optimized hosted Classic clock passes

All five optimized arenas opened normally in the actually released private
capacity. Setup exited 0 at 20:36:31. Each served its matching application,
epoch 1 and chain 4242, and its state-changing preflight produced a committed
batch verified on Monad. First health evidence is
`sync-continuation-20261002/diagnostics/reusable/optimized-health-1.json`.

The only game driver is `pongit-sync-continuation-tournament-3-7388c1c`, started
20:38:46.598862 UTC, original deadline 23:37:46.598862. It runs the complete
Classic championship, up to 28 matches. The sole engine/archive pair is
`pongit-sync-continuation-workers-20261002-{engines,archive}-1`, with original
deadline **3 October 02:36:56.853276 UTC**. No autonomous admission, opening or
closure runs beside these workers. Do not extend their bounds or duplicate
drivers. Tournament 4 may start only after tournament 3 passes and enough
original worker time remains for its entire bounded trial.

Read-only clock observer `pongit-sync-continuation-clock-3-1-7388c1c` exited 0
at 20:45:29.666 UTC. Eight rally segments cover 300,394 ms of wall time and
295,950 ms of physics: **98.5205 percent**, within the 98–102 percent target.
Two feed gaps over 500 ms remain in the report; this is not a passing browser
render or full smoothness verdict. Optimized Chaos has not yet been measured.
Evidence: `evidence/sync-clock-3.json`, copied locally as
`artifacts/sync-vps-20261002/optimized-sync-clock-3.json`.

The public human configuration also reports all three historical arenas as
`starting / ENGINE_SYNCHRONIZING`. An HTTP-200 site or health route must not be
reported as playable. Legacy control and engine IPv4 connections complete TLS
but return no body within seven seconds; IPv6 is unavailable from the VPS.
A separate 45-second read is underway to distinguish slow boot from timeout.
No public service, session or admission gate has been changed.

## Checkpoint, 20:35 UTC — private optimized continuation preserves the source

Import completed at 20:31:32 UTC, exit 0, with 68 confirmed journal entries and
no uncertain entries. New private pool:
`0xdee98e3f7a0f0049244a8257a9cde304d909e5dc`. It has five optimized immutable
arenas, rules 16, the same verified progressive policies and the source family.
The source remains the isolated d47 season, never public history.

Read-only verifier `a6786c2` passes at canonical block 67639413. It compares all
eight identities, sixteen ratings, thirty-four ledger entries, two tournaments,
fourteen fixtures and six historical challenge requests. It also verifies the
same family, qualifications, registration nonces, inherited match counter,
empty lanes, closed gates and historical manifest routes. Evidence is
`sync-continuation-20261002/evidence/continuation-preservation.json`.

The first runtime preparation encountered an existing empty keys directory and
stopped before runtime/database changes. The first verifier launch therefore
also stopped before container creation. Both attempts are recorded in
`evidence/preparation-attempts.json`. The helper was corrected to accept only an
empty, non-symlink directory. No existing key was overwritten. Preparation then
created isolated database `pong_sync_continuation_20261002` successfully.

Backup `sync-20261002T2033Z` has nine SHA256-verified off-VPS files, including the
new deployment and database. Manifest SHA256:
`53b24e36489ba788061c5521dfc3eefa6db8bfe928c730a2ee7e921fa74ec7a2`.
The bounded setup now uses the five actually released owned slots; no human
slot, public gate or public service is changed. Inspect its exact setup plan,
container and report before starting workers. Championships 3 and 4 and actual
optimized clock measurements still remain. No final qualification claim.

## Checkpoint, 20:25 UTC — source released and canonically finalized

The five private d47 arenas completed normal release at 20:05:36 UTC. The
release worker exited 0, with every exact root and result count verified; no
force closure or reopening occurred. Read-only verifier `1be6dbe` exited 0 at
20:20:13. At canonical block 67636774 it verified all 34 terminal results,
14 final tournament fixtures, eight qualified identities, 16 ratings, empty
lanes, closed gates and the five released roots. Its report is
`sync-games-b1f72ee/evidence/sync-source-final-1.json`.

The source archive ran to its original 20:21:07 bound and exited 124. That
bounded process exit is not a failed result-finality assertion: the separate
canonical verifier had already passed. It must not be restarted. Its gas
reserve initially ran out at 0.016100072 test MON. The authorized, journaled
10 MON top-up in `fc571fc` confirmed in transaction
`0x7d296ac6ef777f8bdf2f5fcaa51cb2af0ad25a29d45febed86419bf40d3675d6`.
Do not repeat this funding operation.

Backup `sync-20261002T2025Z` has eight SHA256-verified off-VPS files. Manifest
SHA256 is `e1d7e93a4432c3d40c1aaf8363f93b74ef37df9d1f2b3debbc3996fb576c2088`.
The sole private import worker started at 20:27:10.757663 UTC with its original
20:47:10.757663 deadline. Container:
`pongit-sync-continuation-import-20261002-qualification-1`. All source game,
engine, release and archive workers are stopped. Inspect the target deployment
phase and original nonce journal before any retry. This import opens no arenas
and preserves the private season; it is not a public migration.

Separate read-only public checks found no ready arena despite four free lanes.
All eight public arena health records reported synchronization timeouts. Two
actual legacy engine origins and the legacy control origin timed out in six
seconds. The new control origin responded in 204 ms with the expected v3 hub
and chain. No session was recreated and no public configuration changed. These
observations explain the current availability failure but do not qualify a fix.

The full current TypeScript suite passes 922 tests, root typecheck and docs
checks pass. Previous hosted Chaos clock and browser/admission failures remain
open. No browser startup, public cutover or 24-hour proof is claimed.

## Checkpoint, 19:49 UTC — reproducible optimized candidate ready for private continuation

Published physics commit `3735e2c` contains the optimization verified below.
Commit `7388c1c` also repairs the progressive-policy metadata alias when a
continuation reuses the same verified policy. Twelve focused tests and root
typecheck pass. Explicit private continuation guards preserve d47 history and
allow only its remaining championships; they do not authorize public migration.
Read-only source-finality verifier `1be6dbe` checks all 34 results, 14 fixtures,
ratings, qualifications, empty lanes and exact released roots before import.

Clean image `pongit:sync-clean-7388c1c` was built from pinned Node and `npm ci`,
not a previously patched image. Digest:
`sha256:a0d6ada5fa33fa12ee4a53461aa3c00e9f8054baa990d7698890c259fbbe57c1`.
All 628 audited source paths match the Git commit; 99 isolated image tests pass.
The build began below 80 percent disk use. No public service has changed.

The sole release worker is still running normally, waiting for the five real
20:04:44–20:05:00 release deadlines. Its original 20:22:29.101691 deadline is
unchanged. No game or engine worker is running. After successful release,
`sync-continuation-operations-20261002.py archive` starts only a bounded
900-second source finality worker; `verify 1` is read-only. Stop that archive
after verification, refresh and verify the off-VPS backup, then use the prepared
private import. The import has a 1,200-second bound and opens no arenas. Inspect
reports and journals before any retry. Target root is
`/opt/pongit/tests/fluid-20260928/sync-continuation-20261002`, namespace
`reusable-agents-20261002-2`. It has no deployed/imported target yet.

Hosted Chaos clock remains a failure pending optimized hosted measurements.
Browser startup permission remains pending after automatic review rejected it;
do not launch another route. Admission, browser rendering, championships,
community, concurrent human play, reserve/rotation, public migration, finance,
replays and unchanged 24-hour proof remain outstanding.

## Checkpoint, 19:22 UTC — optimized contracts preserve the physics

The complete optimized Solidity suite passes **960 tests**; eight external/fork
tests remain explicitly skipped. The isolated VPS differential run compares
10,000 Classic cases, 10,000 legacy Chaos cases and 24,000 current/adversarial
Chaos cases with **zero mismatches**, including returned collision events.
The complete linked deployment graph fits its existing size limits. The pool
still has only 11 bytes of reviewed runtime margin; its limit was not raised.

The fixed six-second, twenty-tick benchmark preserves each exact final-state
digest. Classic execution falls from 9,450,510 to **7,498,710 gas**; Chaos without
effects from 36,117,733 to **28,767,377**; Solar Wind from 170,819,852 to
**108,196,054**. These are local EVM execution costs, not a passing hosted clock
or browser test. The optimizations avoid full-state decoding for scalar reads,
combine immutable-module calls, skip absent obstacles and avoid redundant
preparation at a boundary without contact. Preparation equivalence and
idempotence have 1,000 fuzz cases. Rules and TypeScript physics are unchanged.

Evidence is under `docs/evidence/sync-20261002/` and local `artifacts/sync-*`.
The isolated container `pongit-sync-optimized-parity-20261002` exited 0, without
host networking. Its artifact archive SHA256 is
`60e6f290127a6c0b892dd3bca1c5faf3d40d292b60c278cccab3f50d3f266f99`.
No new immutable contracts or public services have been deployed.

Private continuation inputs now exist at
`/opt/pongit/tests/fluid-20260928/sync-continuation-20261002`. The read-only
source-rating seed audit passed, using the original operator journal and
canonical receipts. This is the private d47 season only. No import, gate change
or opening has occurred. The existing release worker still owns normal recovery
at 20:04:44–20:05:00 UTC, with its original 20:22:29.101691 deadline.

## Checkpoint, 19:10 UTC — private results complete; normal release in progress

Both private eliminations passed. Chaos tournament 2 finished at 18:49:51 UTC
with seven canonical results, including 1-5 and 1-6 regulation endings. Its
driver exited 0 and closed both gates. No game driver is active. The private
engine/archive workers stopped normally after all 34 results were captured.
Public services remain unchanged.

The sole private lifecycle process is now
`pongit-sync-release-20261002-qualification-1`, source **59e5208**, image a9b3d62.
It uses the original operator database, journal and advisory lock. All five
private d47 arenas were closed normally only after live/canonical roots matched,
all lanes were empty and no engine command remained pending. Counts are
10, 7, 7, 6 and 4; committed batches are 199, 137, 130, 103 and 95.
Actual release deadlines are **20:04:44 through 20:05:00 UTC**. The worker's
original deadline is **20:22:29.101691 UTC**. Let this process release and verify
the exact finalized roots; do not start a competitor, reopen an arena or extend
the deadline. Runtime `release-runtime-1.json`, plan `release-plan-1.json`, report
`evidence/sync-release-1.json` beneath the existing private root. No new opening
is included. Refresh backups after final recovery.

Backup `sync-20261002T1902Z` has seven SHA256-verified off-VPS files. It contains
the completed tournaments, original operator/public/private databases and runtime
journals. Its verification receipt is mounted read-only into the release worker.
Earlier backups, failed reports and all public/historical contracts remain.

Three contract optimizations are currently local and **uncommitted/undeployed**:
scalar clock reads instead of repeatedly decoding full Chaos state; combined
preparation/grid/force calls; and avoiding duplicate preparation at boundaries
without contacts. A focused intermediate build passed 80 contract tests, including
24 effects, 276 combinations and 1,000 preparation equivalence cases. The final
full Solidity suite is running; inspect `artifacts/sync-optimized-solidity-full.log`
before relying on it. The earlier local benchmark states were byte-identical;
further complete differential and hosted measurements are still required.
None of this resolves the measured Chaos clock failure yet.

Browser startup permission remains pending. No alternate launch or public
cutover occurred. Remaining gates below are unchanged.

## Checkpoint, 18:55 UTC — Chaos clock gate fails; body-bound transports pass

Production remains unchanged. The private Classic elimination completed all seven
canonical fixtures at 18:21:21 UTC. The only game driver is now
`pongit-sync-tournament-2-a7f0b08`, original deadline **19:25:16.159 UTC**.
Its Chaos elimination has reached the final, match 34. Inspect the actual report
before any further admission. Engine/archive workers retain their original
**20:22:12.904511 UTC** bound and the 656a2e1 engine-body override. No writer or
deadline was duplicated or extended.

The per-rally Classic clock sample passed at 98.344% of wall time. Chaos failed:
`sync-clock-2.json` measured 95.688%; a separate diagnostic attempt measured
96.321% over 315.559 seconds. The latter compares engine heads as well as physical
time: 303.010 nominal engine seconds and 303.950 physical seconds. Most rally
spans start and end with zero simulation backlog. This identifies nominal
10-ms-per-block timing as an important source of drift; it does not establish
that a particular process causes the block slowdown. Preserve both failed
reports. Header timestamps were also sampled read-only, not used to change game
rules. No wall-clock fix or passing Chaos-clock claim exists yet.

Commit `4d8b023` fixes a second reproduced body-timeout defect in shared Monad
reads. Before the fix a partial JSON response retained the read lane until a
10.552-second rescue; afterward it aborts around 8.067 seconds and the queued
read progresses. Reads remain paced and bounded; uncertain writes are not
replayed. Root typecheck and all 920 TypeScript tests pass. The Next production
build passes. This does not authorize or prove a browser server launch.

The reproducible a9b3d62 image built successfully:
`sha256:b010c6189eeea540ffe49f67135afe82724159dd7237817371e67266e3b72284`.
Its 87 isolated transport/player/projection/warmup tests passed. An initial test
attempt omitted the test-directory mount and failed before running tests; that
container remains. The earlier clean 656 image has 82 passing tests and 622
source paths matching exact Git blobs. Its initial over-narrow source-difference
assertion remains a separate failed audit, not overwritten.

Canonical publication samples cost 0.731871114 MON for nine commits in 90 seconds
with one active lane, and 1.868095116 MON for 18 commits during 36 seconds of the
actual five-way overlap. Maximum calldata was respectively 14,148 and 31,364
bytes. These are measured transaction charges, not a worst-case release reserve
or guaranteed daily budget. No funding request is needed for current bounded work.

A read-only public migration inventory at block 67612542 found nine identities,
16 ratings, 463 results and 23 tournaments. Five lanes were empty and no requests
were pending at that block, but tournament 23 was unfinished and tournament 9 has
non-final results requiring correction continuity. `migrationReady=false`.
No source gates, imports, public contracts or public services changed.

Backup `sync-20261002T1822Z`, seven files, is SHA256 verified off VPS. The 1650
restore proof remains. Redundant 1747 backup files and four source archives were
removed from the VPS only after new local/VPS hash and mount checks; all original
off-VPS bytes and manifests remain. Recheck occupancy before another image build.

Commit a9b3d62 scopes the existing real-catalogue/browser harness to the exact
private rules-16 pool. It was not launched. The explicit question about starting
Next on 127.0.0.1:4197 is still pending after automatic approval review rejected
the prior launch with `blocked by policy`; do not bypass it. Remaining release
gates and all preservation/nonce-authority constraints below still apply.

## Checkpoint, 18:03 UTC — five simultaneous games pass; HTTP body deadline fixed

Production remains unchanged. All eight private official archetypes now have
actual Classic and Chaos qualifications. Controller trials 5 and 6 exited 0;
trial 5 includes a real 5-5 draw at exactly 300 physical seconds. No artificial
winner was recorded. The private season is still not a public migration.

The five-way trial passed at 17:48:21 UTC. VECTOR's tournament match 17 and its
four independent friendly copies 18-21 overlapped for **36,997 ms**. Each
synthetic human issued 100 confirmed movements; command p95 was respectively
190.90, 129.35, 138.09 and 152.54 ms from the VPS. Every heartbeat loop completed
without error. All five results were published and captured. The tournament
ended 7-2; the four friendly results were 0-7, 0-7, 0-7 and 2-7. These stationary
endings after the movement test are not measurements of human win rates.
Report: `evidence/five-concurrent-1.json`, container
`pongit-sync-concurrent-1-15a01b3`, exited 0. This is not browser, physical
passkey, seven-way human overlap, admission-latency or 24-hour evidence.

Read-only Chaos match 16 projection passed 107 eligible intervals with zero
position error. Five intervals spanning new randomness were explicitly excluded;
no future proof was supplied to the predictor. `sync-projection-16.json` also
records physical/wall-clock ratio 0.9659 over a 34.7-second window spanning point
boundaries. This is not a passing measurement of the 98-102% **during-rally**
requirement; that gate remains open. Classic's prior 103 exact intervals remain.

A private arena retained stale `awaiting-publication` health for match 19 after
its result had been captured. Other arenas remained available; there were no
pending engine commands or database lock waits. It recovered before the worker
replacement. The exact suspended await in that process has not been proven.
Investigation found and reproduced a separate concrete transport defect: viem's
HTTP timeout covers receipt of headers, then clears while the response decoder
can wait indefinitely for the body. The actual loopback reproducer failed after
its 7.5-second rescue closed the connection. Commit **656a2e1** keeps an independent
four-second abort signal through body consumption. Reads and uncertain writes
are bounded; writes are neither retried nor acknowledged. All 66 focused tests
and root typecheck pass. Before/after logs are retained in local artifacts.

The clean Docker target from **a7f0b08** built from pinned Node and the lockfile,
without a historically patched base. Image:
`sha256:55490439d09cd9b12e57cf0b70f3a8c94f3869c319d0d2e9df2403046a96b7ef`.
Its real imports and 81 isolated transport/player/projection tests pass. Source
audit found only the expected concurrent-driver and command-feed differences
against the prior private image, plus four new files; no source was removed.
A fresh reproducible build of **656a2e1** is running with a separate original
900-second bound; inspect `clean-build-656a2e1.json` before using its image.

Both old stage-2 workers stopped normally at 17:56:35-36 UTC, after all games
were captured. Their containers/logs remain. The sole workers now are
`pongit-sync-body-20261002-engines-1` and `pongit-sync-body-20261002-archive-1`.
They use the clean a7f0b08 image plus the reviewed 656a2e1 transport file, whose
SHA256 is `2b9872b82cc53abdcd51c0514b297c94b1e5bf9df6e6b212eb100a2cd3f53551`.
Their original **20:22:12.904511 UTC** deadline was retained, not extended.
Runtime: `runtime-body.json`; evidence: `body-recovery.json`.

The only game driver is **pongit-sync-tournament-1-a7f0b08**. It completes the
existing elimination tournament, with original deadline **19:00:23.662342 UTC**.
At 18:00:46, two of seven fixtures were resolved and the third was bound. Read
`five-tournament-1.json` before acting. The helper
`/opt/pongit/tests/fluid-20260928/sync-tournament-start-20261002.py 2` may start
the next elimination only after the first passes, its container stops, the
contract's one-minute interval ends, and the existing workers cover the new
fixed deadline. It does not renew or open arenas. Championships need a separate
bounded operation after these workers stop; never extend their deadlines.

Backup **sync-20261002T1747Z**, seven files, is SHA256 verified off VPS. The prior
1650 restore proof remains valid. Nineteen older intermediate backup files
(422,582,739 bytes) were rechecked against their off-VPS SHA256 copies before
their redundant VPS copies were removed. Their manifests and every original
off-VPS byte remain. Latest backup, production, rollback, volumes and failed
evidence are preserved. Before the next build, actual usable-space occupancy
was below 80% (the rounded df display says 80%). Recheck before future builds.

Remaining gates: real browser/catalogue control and latency, per-rally clock and
render measurements, full formats, community qualification on a compatible base,
seven-way overlap, publication/release reserve, public-data migration, finances,
replays and the unchanged 24-hour trial. The previous local Next startup rejection
by automatic approval review remains unresolved; do not bypass it with another
launch route. No new funding request. Preserve all journals and failed reports.

## Checkpoint, 17:23 UTC — next private operation, original bounds preserved

Controller trial 4 passed all four published results and exited 0 at
17:20:16 UTC. The original engine/archive workers were stopped normally at
17:22 UTC, after every game was captured. Their deadlines were not extended.
Separate operation `pongit-sync-stage2-20261002` now has one engine and one
archive worker, with fixed deadline **20:22:12.904511 UTC** in
`worker-stage2-plan.json`. It uses the same private image, database and journals;
there is no competing engine, automatic admission or lifecycle opener.

The only game driver is now `pongit-sync-controllers-5-b1f72ee`, requesting four
further policy qualifications with its own original 13-minute deadline. Read
`controller-plan-5.json` and `five-controllers-5.json` before any next operation.
The remaining sixth controller trial must request only one game. Then, only
after all eight bots actually qualify in both modes and lanes are free, use the
heartbeat-aware five-concurrent driver from `15a01b3` with the `cdde076` feed
override. It must keep each human heartbeat independent while the tournament
continues. None of those future gates has passed yet.

The private action helper is `/opt/pongit/tests/fluid-20260928/sync-stage2-20261002.py`;
its start action has already run and must not be repeated. Its qualify/concurrent
actions verify preceding reports and worker coverage; inspect live state first.
Production remains unchanged. Backup 1712 is off VPS and hash verified. No
funding request. All prior limits, browser rejection and preservation rules below
continue to apply.

## Checkpoint, 17:19 UTC — hosted Chaos and integrated projection pass

Production remains unchanged. Published qualification additions are `159861f`
(opening the four remaining owned private arenas), `15a01b3` (heartbeat-aware
five-way driver), and `414bfbe` (read-only hosted projection comparison). These
are not public qualification or migration. The final unchanged 24 hours have
not started. The prior browser server approval rejection is still unresolved.

Rules-16 Chaos controller match 3 finished 1-7 and was captured at 16:52:40 UTC.
Friendly Chaos match 4 then passed with 100 scoped commands, p95 130.54 ms from
the VPS. A deliberate outage froze physics at 7.210000 seconds, score 0-1, for
3.595 seconds. That point occurred during the permitted initial 500-ms credit;
neither score nor physical state changed during the verified freeze. Resume
waited exactly 300 engine blocks and preserved physical time. The match finished
normally 1-7 at 42.480885 physical seconds; its published result hash is
`0xb9cbc0adb34f11a0d3015ff3b797815c8467a6c667bf45ff0e7b5681c9db7011`.
Competitive ratings remained unchanged. Driver `pongit-sync-player-1-8d817a0`
exited 0 at 16:57:28 UTC and closed both private admission gates. This remains a
synthetic owner test, not browser/Mera/input-to-paint evidence.

The four other rules-16 arenas opened normally through the original operator
journal at 17:06 UTC. Their report is `sync-capacity-open.json`. Publisher funds
were 47,905.681427207516479201 MON and the operator 404.782893552 MON at block
67598309; fee 0.01 MON per opening. All five hosted engines subsequently passed
state-changing publication checks. No provider configuration or human slot was
changed. No funding request is needed for these bounded trials.

Controller trial 3 passed three simultaneous matches, including independent
Classic and Chaos instances of the same official policies. It exited 0 at
17:13:35 UTC. Trial 4 is the sole current game driver:
`pongit-sync-controllers-4-b1f72ee`, four games 8-11, original deadline
17:27:08.945 UTC. Three were published by 17:18; match 11 remained active. Do not
start another gate owner until its report finishes and lanes are canonically
free. Both existing engine/archive workers keep their ORIGINAL stop at
17:31:04.778605 UTC. No deadline was extended. More qualification requires a
separate bounded operation after these workers are stopped and inspected.

Read-only hosted Classic match 9 comparison passed 103 eligible intervals:
zero difference for ball X/Y and both paddle positions between participant
projection and the next confirmed state. It ended when the real match finished,
at 17:18:21 UTC. Report `sync-projection-9.json` does not claim browser rendering,
GPU, input or network latency. The initial probe failed before connection because
the backend image lacks the imported historical `interlude-rooms.json` file;
its exited container is preserved. The second read-only attempt mounted that
exact tracked manifest and passed. No gameplay or image was changed.

Backup `sync-20261002T1650Z` has seven SHA256-verified off-VPS files. Its first
restore in the old isolated test database failed: the database stores PGDATA in
tmpfs and its 256-MiB cgroup killed COPY with OOM. The failed report and partial
scratch database remain. A separate network-isolated, disk-backed database with
512-MiB memory cap and 32-MiB shared buffers restored the SAME dump bytes without
error or OOM: 66 operator tables/11,630 lifecycle jobs, 11 public-agent tables/
400,682 engine jobs, and nine private tables/658 engine jobs. No production
database was restored. That successful scratch container is stopped. Its report
is `backup-restore-disk-1650.json`. The newer seven-file backup
`sync-20261002T1712Z` is also SHA256 verified off VPS. Both directories are under
`C:/Users/wwwle/.codex/private-backups/pongit/`.

Keep prior failed browser/admission measurements as failures. Remaining gates
include all eight real bot qualifications, four controlled copies plus tournament,
all tournament formats, real browser/catalogue responsiveness, seven-way human
overlap, publication/release reserve, compatible public migration, finances and
replays, and the unchanged 24-hour trial. Disk exceeds 80 percent again; perform
scoped cleanup before another image build. Preserve journals, historical data,
failed reports and personal documents. No subagents or competing writers.

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
