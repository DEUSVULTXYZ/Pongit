# Fluid input timing — 7 October 2026

Final production web source: `6bb63f8`, deployed 14:11:39 UTC. Normal production
checks: eight bot matches passed synchronization plus two final PvP matches.
Final PvP local response p95 is 14.2-16.6ms, compared with 34.7-50.5ms before.
The degraded-network failure and desktop admission failures remain limitations.

Scope: compatible browser-only correction after the second reship. Contracts,
physical collisions, continuous delegations, nonce ownership and production
engines remain unchanged. Scheduled automation remains paused.

## Demonstrated cause

Public Chaos 883 had a 426.7944 ms input response. Afterwards the live snapshot
clock was 8.210 s, while the monotonic displayed clock remained at 8.540 s.
A new local key at snapshot age 124 ms was stamped 8.334 s and replayed into the
already displayed past. The visible paddle jumped 38.316 px without any new
physical snapshot or active Chaos effect. This is distinct from an ACK correction.

Four regression cases reproduced the failure before the fix (Classic/Chaos,
both sides). New local intent now uses the fresh, match-scoped presentation
clock when it is ahead. Engine acceptance timestamps still supersede speculation
and use the existing reconciliation. Stale paints and other match references are
excluded. A ref-only callback avoids a React render per frame. No extra playout
buffer or slower command cadence was introduced.

## Local validation

- Full TypeScript suite: 1,041 passed, zero failed; root typecheck passed.
- Regression includes release, reversal, ACK retiming and stale/future paints.
- Existing collision, point-boundary, pause-ceiling and reconciliation tests pass.
- Source commit: `01ba01c`; web-only build and deployment proof follow below.
- Baseline failed reports remain at `artifacts/qualification/catalogue-reship-repeat-chaos2`
  and `catalogue-reship-repeat-classic1`. Full gates also failed admission at
  9.064 s and 8.760 s respectively. This correction does not claim to fix admission.

## Operations

Before building, 26 obsolete, unmounted intermediate backup files (290,441,492
bytes) were removed only after checking every byte against the existing off-VPS
copies and all Docker mounts. Final backups, successful restore inputs, production,
rollback images, volumes, journals and unrelated work were preserved.

Web rollback configuration: `/opt/pongit/releases/fluid-input-01ba01c/backup-before`.
SHA-verified off-VPS at `C:/Users/wwwle/.codex/private-backups/pongit/fluid-input-01ba01c/backup-before`.
Manifest SHA: `d029ab6e02647fa8e697911ea79110a6fd6d6a7f2f3cdbb851d007cedffa66c2`.
This web-only release does not restore any database or chain state.

## Hosted verification

Deployed at 13:11:11 UTC. Web image
`sha256:4d3244c434acb9452d31b0931a802e4926a451d475444061f713a200174629b6`.
Engine, admission and human relayer image identities and start times are unchanged.
Public `/`, `/agents`, `/agents/tournaments`, `/rooms` and `/docs` return HTTP 200.
An exploratory `/play` request returned 404 because that route does not exist;
it is retained as a probe mistake, not counted as a successful route check.

The sequential real-browser matrix completed. First natural Chaos match 892
finished 2–7, published, and passed every gate. Player/observer maximum holds
116.8/116.5 ms; no paddle or snapshot jumps, pause, resync or command rejection.
Local response p95 18.8 ms; submission p95 17.52 ms; independent observer p95
16.05 ms. Admission 7.342 s. One passing match is not the full qualification.
Actual browsers use virtual PRF authenticators; no physical device claim.


## Retained publication failure and recovery — 13:22 UTC

Chaos 894 finished naturally 3–7 with zero pause/resync or visible discontinuity,
but its original browser run failed because the result was not captured within
its deadline. Admission also measured 8.129 s. This failure remains unchanged.
Matching-epoch node health showed committed batches, zero pending diffs and no
publication error. Archive logs identified insufficient service gas reserve;
canonical block 68980389 showed only 0.13024999 MON in its scoped account.

An exact, journaled transfer moved 10 TEST MON from the existing sponsor reserve
to the existing archive signer, preserving 35.716086878 MON in the sponsor.
Transaction: `0x579c530b7a2a9b47f21e6b749cf8eb0e200f26f6cc62b1aad20c207db5e1847f`.
The original signer lock and nonce journal were reused. No service restarted,
no delegation closed, and no operation was discarded. Archive resumed normally;
match 894 was separately verified published at canonical block 68980862.
A new sequential browser series started only after that recovery; the old report
was not changed into a pass. No new funding from the user is needed for these tests.

## Normal browser series

Five completed public Chaos matches against NOVA (892, 896–899) and two Classic
matches (900, 902) pass all natural synchronization gates on Chrome/Edge:
zero startup pause, protective resume, visible resync, measured paddle/snapshot
jump, rejected command or execution-clock stall. Each result was captured on
Monad without closing a delegation. This is bounded evidence, not a 24-hour claim.

Worst per-game p95: local input 18.8 ms, intent-to-confirmed receipt 24.61 ms,
transport response 18.54 ms, independent observer reception 16.06 ms.
Longest measured normal hold: 183.3 ms player / 183.4 ms observer.
Normal corrections remain: per-game p95 <=1.38 px; transient maximum 71.96 px.
After-release drift was zero in several runs but reached 16.032 px once following
a slow receipt. No longer interpolation buffer was added to conceal this tail.

Admission ranges 6.805–9.066 seconds. Reports 899 and 900 remain full-performance
FAIL for exceeding eight seconds despite passing their synchronization gates.
The separate earlier match 894 failure is retained as described above.
The input-clock change alone is not evidence of an admission improvement.

Classic PvP finished naturally 7–6 with 610 paired controls, observer p95 17.01 ms
versus transport 18.68 ms. The first Chaos PvP run finished naturally 7-6, but FAILED local response:
player 0 p95 50.5 ms (player 1 35.2 ms). Other synchronization gates passed.
This original failure remains; it is not counted as successful acceptance.

## Immediate dispatch and recovery

`58fee17` connects real PvP input to the existing serialized sender instead of
waiting for its 100 ms timer. Focused tests, 1,042 full TypeScript tests and root
typecheck passed. It was deployed at 13:49:11 UTC, web image
`sha256:46c32d2b65bd9f439ad9bbeecaec3cad76b9443dc0f32f8e683324c080b6a301`.

The actual Classic run `browser-fluid7bclassic` finished 2-7 but FAILED. Player 0
local p95 improved from 42.5 to 16 ms. Player 1 lost a response and resumed sending
9.27 seconds after sequence 19. The original command's exact bytes were recovered
through the existing journal. This was not an accepted nonce replacement.
Player 1 showed one visible resync, local p95 270.8 ms and a missed local response.
Source retained speculative input IDs inside a match but reset the sender's IDs
after recovery. Its next inputs collided with old IDs and old prediction times.
The earlier immediate-dispatch test is therefore not accepted as production proof.

At 13:52:03 UTC the web was rolled back to `01ba01c`, without touching any
backend, database or active delegation. Both deploy and rollback records remain.
This failed run is additional evidence, not an assertion that immediate dispatch
itself caused the response loss.

`03fc112` gives recovered PvP senders a shared per-match input ID allocator, so
later accepted intent clears earlier unsent predictions correctly. A regression
covers a recovered sender, old unsent release and the first post-recovery ACK.
The PvP rules-14 client also uses the existing preconnected WebSocket send router
already used by agent games. Its uncertainty journal, single nonce owner,
HTTP fallback after a socket loss and four-second transport deadline are preserved.
The router is released when the arena view unmounts. Older rules remain unchanged.
The harness now records failed HTTP command requests without their bodies.

Validation: 55 focused tests, 1,043 full TypeScript tests and root typecheck pass.
The superseding `6bb63f8` hosted tests below provide the final bounded evidence; no full release qualification claim.

Second build cleanup removed only 32 untagged obsolete PONGIT build-cache images,
checking all container references first, without prune/force. Production and
rollback images, volumes and containers remain. Disk fell from 80.44% to 78.30%.
A separate backup-file inventory was read but no files from it were deleted.

The `58fee17` pre-deploy backup was SHA-verified off VPS at 13:49:01 UTC, manifest
`81a88e44fe5620059d6da347a0ab424d9e31583da43fa1412c12fbc8c5508534`.
The independent pre-deploy backup for the subsequent web build is recorded below.


## Neutral recovery and degraded network

`6bb63f8` extends the recovered sender fix to its first automatic neutral command,
which can precede any new key. Its acknowledged ID must also retire old unsent
intentions. The regression uses a real encoded ControlQueued receipt and verifies
old speculative controls disappear only after that ACK. Full TypeScript suite:
1,044 passed, root typecheck passed. Build `03fc112` passed but was not deployed;
its immutable image and report remain preserved.

Degraded Chaos 903 used HTTP-only commands with 75 ms added in each direction.
It ended naturally 3-7 and was separately verified published at block 68989919.
It FAILED: admission 9.846s, two protective resumes, 7.233s paused, one visible
resync, longest hold 583.4ms. Transport p95 193.51ms; observer p95 104.03ms;
local response p95 48.3ms. No measured paddle/snapshot jump. This is deliberately
outside the normal RTT<80ms acceptance conditions, but it exposes a remaining
liveness/smoothness limit and is not hidden or counted as a pass. Its unchanged
report, trace and videos are retained. No contract grace was raised to conceal it.


## Final web deployment

`6bb63f8` built from its published Git archive with current live manifests and was
deployed at 14:11:39 UTC. Image:
`sha256:a66f847dff8a275cc1e75814bf28314ab5b140a116f95dc082bd321922ec1841`.
Build report retains archive SHA, start/end, log SHA and the 79.895% pre-build
usable-disk reading. No image was built above the prescribed 80% pre-build gate.
The five public routes all return HTTP 200 after deployment.

Rollback config was copied off VPS and SHA-verified at 14:11:33 UTC, manifest
`af6d51af9d444da1cf8969dce3484df210d91fb3182e1ee264367e6717cdec59`.
The exact rollback is `python3 /opt/pongit/releases/fluid-input-6bb63f8/release.py rollback 6bb63f8`. It restores only web image 01ba01c and updates the two existing
Compose files; it never restores a database, reuses a nonce or changes a contract.
This operation has not been run for 6bb63f8. The earlier 58fee17 rollback has.


## Final Classic PvP result

`browser-fluid7cclassic` passed a complete natural 7-6 match on Edge, with two
independent players and a spectator. 647 paired controls; actual WebSocket command
traffic verified. Local p95 16.6/16.5ms, versus 42.5/34.7ms in the same scripted
Classic scenario before immediate dispatch. Peer p95 19.01ms versus send 18.38ms.
No contract pause, visible resync, snapshot/paddle jump or rejected command.
Max player/observer hold <=100ms; frame p95 <=17.1ms. Paddle correction p95 fell
from 12.70/11.34px to 2.87/2.60px. Transient max on one side was 44.77px, so this
is not a claim of zero numerical corrections. No additional passkey ceremony
was requested during gameplay.


## Final Chaos PvP result

`browser-chaos-fluid7cchaos` passed a complete natural 7-6 match, 646 paired
controls. Local p95 14.5/14.2ms, versus 50.5/35.2ms before immediate dispatch.
Peer p95 16.35ms, send 16.48ms, player max holds 116.7ms, frame p95 <=17.1ms.
Zero contract pause, visible resync, snapshot/paddle jump or failed command.
Correction p95 2.60/2.47px, transient max <=11.38px.

The spectator placed an actual 0.006 test MON bet then deliberately disconnected.
Its prior opaque-document sessionStorage page error is retained. Chaos peer
latency is player-to-player; this run does not claim a complete spectator GPU
trace or a new payout proof. Classic kept its independent spectator throughout.
Chrome/Edge tests use virtual PRF authenticators and actual public contracts;
no claim of physical mobile/passkey testing or an unchanged 24-hour soak.


## Final touch regression

Actual Chrome at a 390px touch viewport, virtual PRF: public Chaos 904 versus
NOVA finished naturally 2-7 and was published. The saved arcade session was
reused. Full performance and natural synchronization gates passed: admission
7.781s, local p95 15.1ms, command receipt p95 112.84ms, peer p95 10.01ms.
No pause, resume, visible resync, paddle/snapshot jump; 47 measured releases had
zero stopping drift. Max player/observer hold 116.9/183.7ms; frame p95 17.1ms.
This is a real browser with touch emulation, not a physical-phone benchmark.

The final bounded evidence comprises eight bot matches with synchronization
passing (five normal desktop Chaos, two desktop Classic, one touch Chaos) and
two final PvP matches. Desktop admission failures remain explicitly retained.
The separate degraded run and intermediate PvP failures remain FAIL. Source and
proofs are published on codex/arcade-release-20260919; qualified=false and the
scheduled follow-up remains paused. A 24-hour qualification is not claimed.


## Final backup and remaining limits

Final backup completed 14:20:22 UTC: five PostgreSQL dumps plus protected runtime
configuration, six files, 74,093,274 bytes. SHA-verified off VPS at 14:20:51 UTC:
`C:/Users/wwwle/.codex/private-backups/pongit/fluid-input-6bb63f8/backup-final`.
Manifest: `068287c898f198a0f93b8a0d307e7c4277aa512ec6f39d469993af9448f4744d`.
It includes the funding journal and final/rolled-back configurations. The earlier
five-database reship backup was actually restored from its Windows copy at
12:48:14 UTC; this newer post-game backup is SHA-verified, not separately restored.
No backup restore is part of this compatible web rollback.

Measurements are bounded scripted public-browser runs, not a guarantee for every
network or device. HTTP-only +150ms injected RTT still fails the desired smoothness;
normal desktop admission remains 6.805-9.066s. Numerical correction tails remain
explicitly reported. Test source, safe report summaries and SHA references are in
`docs/validation/fluid-input-20261007.json`. Failed reports and all media remain
unchanged locally. All browser drivers ended; production continues, scheduler
paused. Refresh an already-open page to load the new browser code.
