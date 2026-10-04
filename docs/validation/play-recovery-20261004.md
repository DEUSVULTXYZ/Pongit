# Public play recovery â€” 4 October 2026

User authorizes production tests and fixes. The scheduled qualification remains
paused. This intervention addresses unavailable PvP and repeated friendly-bot
pauses; it does not claim final 24-hour qualification.

## Verified failures

Human canonical block 67994095: both lobby slots and all reservations are empty,
25 published results, three legacy-hub arenas have zero batches. The live relayer
still queried the new hub's public control hostname for those legacy contracts.
Two epochs were already closing, one starting. This is not occupied PvP capacity.

The correct legacy control and all three pinned human nodes timed out from the
VPS, repeatedly. The new control answers but reports 50/50 machines. Its separate
validator delegation limit is 128 and its balance is not low. Changing a URL does
not make a legacy immutable contract use the new hub. New public human contracts
need compatible history/finance migration and actual hosted capacity; do not
substitute the private qualification season or agent machines.

Actual browser baseline 573 and delayed-read trial 575 completed. Trial 574
missed countdown digit 3 and failed before testing idle liveness. Its subsequent
cancellation was caused by the test ending, not proof of the user's pause loop.

With WebSocket blocked and real HTTP reads delayed 150ms, trial 578 timed out
after 60 seconds at Starting match. No readiness command reached HTTP. The viem
send timeout started only after socket connection; a failed handshake could hold
the entire command lane indefinitely.

## Deployed fixes

Commit 9c32fd2 bounds socket connection and response together. A late connection
is closed before it can send bytes. Transport loss retains the original nonce
journal and selects HTTP for the match instead of retrying the failed socket
every recovery countdown. No automatic signed-command retry was added.

Web image sha256:2347639615762ce230ea3946c4c47f2ec47cf24d20f812d4c422afb5dd81b667
deployed at 02:23:24 UTC. Previous image ee52f22 remains available. Backend agent
roles, contracts, scoped journals and databases are unchanged.

Human routing deployed at 02:20:16 UTC: four source mounts from 9c32fd2 over the
original human image e6fa5f7. They select and verify the matching hub control and
stop interpreting another hub's HTTP 404 as permission for voluntary replacement.
Original lifecycle journal, key and database remain the only authority. Relayer
is healthy; human engines remain unavailable. This is not a successful PvP test.

## Browser evidence and limitations

Real public Classic 583 completed 4â€“7 over HTTP with WebSocket blocked and 150ms
extra read delivery latency: 222 input commands, 125 heartbeats, F5 without another
passkey. Twenty seconds without movement produced 97 successful heartbeats.
Local input p95 17.3ms, receipt p95 14.9ms. This delay was applied to reads, not
write responses. Browser authenticator is virtual. This is not a physical-device
test or proof of zero visual corrections on degraded networks.

Admission was 17.691 seconds (FAIL 8 seconds). Startup still caused an unnecessary
resume countdown; F5 caused the other expected recovery. Snapshot correction
samples are preserved. A functional PASS is not a performance PASS.

Commit 05740dd removes repeated readiness/launch reads and observes the real
phase transition near the confirmed launch deadline. Its public trial 588 still
failed: one startup resume and 3.33 seconds paused. This failure is preserved.
The forced snapshot path also forced another identity round trip, delaying the
first liveness command. Commit a3d56aa gives the launch a fresh snapshot while
reusing a still-valid identity. Identity expiry, wrong epoch, command fences and
the 500ms fairness limit remain enforced. Its 52 focused tests and root TypeScript
pass; public regressions now pass as detailed below.

Web a3d56aa, image66780d36b04ae06f1f72701c510e45b0985eadd601ceaa50b4318c460ac83c0a,
was deployed at 02:51:31 UTC. Two build setup failures are retained (unsupported
legacy-builder CPU option and relative API URL). The third build passes using
the existing absolute public API URL. Both product source hashes match git blobs;
Windows CRLF working-copy hashes differ from the LF archive by design.

60 socket/player tests, 14 routing tests and 51 player/heartbeat/countdown tests
passed (overlapping suites). Root TypeScript and first web build passed. Original
failed reports and traces remain under artifacts/qualification; compact reports
are in play-recovery-20261004.

## Preservation and rollback

Backup play-recovery-20261004T0226Z: seven files, 338342185 bytes, off-VPS SHA
verified at 02:19:18 UTC. Manifest SHA256:
882e6b4e178705c143fe7307e8ac26cc80c9f5ddd735dfc6953817d869ceb68c.
The earlier 0225 attempt failed its source-manifest assertion before dumping and
remains preserved. Five-database restore proof from 3 October remains separate;
this new copy has not been restored.

Web rollback changes only arcade-web image in both current Compose definitions.
Human rollback restores the saved Compose override from
/opt/pongit/hotfix/play-human-routing-9c32fd2/compose.override.before.private.yaml;
that version has the known wrong control route. Never restore older databases or
nonce journals over new activity. Existing closures remain owned by the normal
relayer; do not duplicate releases or force-close another match.

Before the second build, four unused, untagged PONGIT web compilation images
were checked against every container, then removed without force. Disk fell
81.22% to 79.55%. Runtime/rollback images, volumes and failed evidence remain.

## Existing human qualification engines

Read-only checks at 02:46 UTC found the two private v3 human engines still serving
their exact app and epoch 1. Their prior season, ratings and financial contracts
are private qualification history and are not imported into the public game.
The first diagnostic mistakenly used legacy il- hostnames for v3; that failure
is retained separately and is not evidence these engines were offline. Correct
il2-eu origins come from the reviewed hostedArenaOrigin function. Replacing the
public manifest with this private deployment would break the approved history
preservation requirement. No such replacement was made.

## Final public browser checks, 02:56 UTC

- Chrome Classic 591: WebSocket blocked, HTTP reads delayed 150ms, 20 seconds
  without movement. Zero startup resumes and zero initial contract pause time;
  101 heartbeats in the initial idle window. 115 heartbeats over the full trial,
  one deliberate F5 resume, no other resume. Published 0–7 result and result
  window agree. Local input p95 15.7ms; intent to receipt p95 18.36ms. Maximum
  unexplained player hold 66.8ms, spectator hold 166.9ms.
- Edge Chaos 593: ordinary real transport, 20 seconds stationary, zero startup
  resumes/initial pause time. 128 heartbeats, only the deliberate F5 resume.
  Published 2–7 result and result window agree. Local input p95 17.7ms; intent
  to receipt p95 16.34ms. Maximum unexplained player hold 182.9ms, spectator
  hold 166.4ms.

Both trials use the actual public catalogue, real contracts and a virtual Mera
PRF authenticator. They preserve grants across F5 and perform more than 100
confirmed inputs. They do not certify a physical passkey, every network, mobile
hardware or 24 hours. Ordinary game traffic and results were never mocked.
The Chrome read-only delay does not delay write responses.

Admission remains outside the requested 8-second target: 15.276 seconds with the
broken-socket fallback, 8.171 seconds under normal Edge transport. These failures
remain explicitly false in the reports. F5 deliberately invokes the protected
pause/recovery countdown; it is not reported as a freeze while play continues.
The final harness also rejects more than one resume in these F5 scenarios.

PvP remains BLOCKED. At 02:53:33, its three public arenas are offline despite
empty canonical slots; the old control times out and the new control reports
50/50 machines with no queued creation. The routing defect is fixed, but no
actual human game passed. Restoring the legacy hosted service or obtaining
actual v3 hosting for a compatible public-history migration is still necessary.
No funding request, provider setting change, private-season substitution or
additional contract deployment was made during this repair.

Second scoped disk cleanup removed 21 unused, untagged PONGIT web compilation
images, checked against every container before removal without force. Disk fell
to 71.26 percent before rebuilding. All tagged runtime/rollback images and data
volumes remain. All failed browser/build reports remain distinct.

Final backup `play-recovery-20261004T0257Z` contains seven files / 340,615,376 bytes,
including all five current databases, updated Compose files, both human source
mount sets and runtime journals. Manifest SHA256:
`a945ac0ab4ec07364a79ab8b4114053fc676e75365e5a01c1f66c4c0bdec36ca`.
Its off-VPS verification receipt is `play-recovery-20261004/backup-off-vps.json`.
No database restore or deletion accompanied the deployments. Automation remains
paused. No test driver remains after the two final browser runs.
