# Admission and funded result recovery, 1 October 2026

## Authorization and result recovery

The user now authorizes necessary test MON transfers from the supplied PONGIT
reserve without another per-transfer approval. This supersedes the previous
automation instruction prohibiting automatic transfers. Each transfer remains
bounded and idempotent in the original operator journal; unrelated assets,
permissions and signing keys are unchanged.

Operation `flow-funding-20261001:archive-100` transferred 100 test MON from
`0x369158Ac444278541322643E46e0D5b45ac21C4C` to the existing archive signer
`0x38078433f7a63b3e6abdef49a726599d655f42c5`. The canonical transaction is
`0x398226700c80b13c1a532b7c776cc1dce4630559413325160e02a4688a9c9b26`,
block 67128294. Gas cost was 0.002590596 MON; the reserve retained
524.974272676 MON at that block. The one-off funding process exited normally.
See `archive-refill-20261001.json`.

The existing archive service then captured both published results, without
another capture writer or a replayed match. At block 67130314, match 254 on
9b8e/12 is captured at 2-4 and match 255 on 7a45/12 at 0-7. Their result hashes
match the earlier archived proofs. Both remain contestable. The original
browser fixture still FAILS its original deadline; this later recovery does
not change that verdict. See `capture-after-funding-20261001.json`.

Before the transfer, backup `flow-funding-20261001T0138Z` was copied off VPS and
SHA-verified:

- agents.dump: `73410d73aa27ee625f449fd03ba45933bfe2da73ee66880ecf61956c91a1ac6a`
- operator.dump: `10d0206ca9303e73c077a07b20f86f3ffb303935b9027017689557ec5997ba7b`
- runtime.tar.gz: `b0b56b9e18a8ec6060c9ae5c0c83757a4064ec534d505c90b72fabedeefaf706`

## Admission measurements and candidate

The previous real Chaos trial spent about 2.5 seconds in sponsored intake.
Independent measurements reproduce slow configuration reads at 1.4-2.8 seconds.
Increasing the isolated test's CPU quota from 0.5 to 1 core did not improve its
samples consistently; production quotas were not changed.

The automatic multicall timer split the ten authority/admission reads into two
or three RPC calls. The candidate submits one explicit bounded multicall at
the observed block. It preserves every authority, lane count, arena identity,
release-evidence and admission check, plus the final canonical block-hash
verification. Nothing is accepted on a failed member or a cached gate.

Six alternating observations at block 67129864 return identical views. Before:
1,362 / 2,217 / 2,187 ms with two `eth_call` requests each. Candidate:
1,287 / 969 / 1,127 ms with one `eth_call` request each. These small samples
prove request reduction and equal observations, not the end-to-end 8-second
target. See `admission-config-batch-20261001.json`.

The browser candidate checks a saved sponsor operation every 250 ms for its
first five seconds, then every second as before, with one request at a time
and the same 45-second bound. These checks read the operation journal, not
Interlude. Errors and timeouts retain the exact saved intent.

At 01:47 UTC the shared Monad gateway had queued live and historical work;
the primary had recently throttled an `eth_call`. This is a separate RPC
observation, not an Interlude publication or 600-request/second diagnosis.
No provider configuration or human backend was changed.

## Remaining gates

Tournament 12 is still active. Progressive policies and catalogue migration
remain undeployed. The admission candidate needs built-image import checks
and actual browser qualification before its public capability is enabled.
Preserve all previous failed reports and pending operations. Hosted eight-bot
difficulty, finances, full concurrency, publication reserve and the unchanged
24-hour qualification remain required. No full-delivery claim is supported.

## Built-image validation and compatible deployment, 02:08 UTC

Commit `5007c20` contains the bounded multicall and confirmation-observation
changes. Its full-source backend image is
`sha256:bd5e80b4638c8d6a2cdd58a06e045a64af290b2a2338c4bc93e650a6b5991e13`.
The actual image passes transitive role imports without network, keys or a
database. Its PostgreSQL writer regression passes against an isolated database
and simulated loopback RPC: intake races, lost responses, restart, insufficient
gas, separate signer queues, shutdown and eager observation. No chain
transaction is produced by this regression. See `admission-writer-20261001.json`.

Backup `admission-20261001T0202Z` is SHA-verified off VPS:

- agents.dump: `204443173e153fa9238cddcebb8bed5c46c3f0143bce8e99fe37a52ed0e6b156`
- operator.dump: `5260a7d3615b2626838787d581694624704920072e4904e11065e9f20ad0e6c2`
- runtime.tar.gz: `6a5b8f70da7f0a5eab869e8221c59703cfe151eb3b97f744356f43dccdfcba56`

Reader and sponsor adopted that image at 02:03:53 UTC. The operator database,
signers, journals, role resources and all engine/maintenance services are
unchanged. Public config returns 200; an unknown operation returns the intended
404. Both services remain running without module failures or restarts.

The web image is
`sha256:d11306886d0f62926162747c9f543c99632551e32d94ececdbb1a6c530bfb7dd`.
The initial live-loopback fixture FAILED because SSH forwarding was refused;
its report is preserved. Exact HTML/assets captured from the isolated image
then passed 39 Chrome and 39 Edge checks, including mobile, landscape, reduced
motion, touch/zoom, pixel header, countdown, results and replays. These are
synthetic API/engine fixtures, not hosted gameplay proof. The compatible web
update deployed at 02:07:54 UTC. `challengeAdmission` remains absent from the
public manifest; atomic admission is still an explicit browser qualification
override only. No human backend changed.

Rollback: restore only the previous role image references from
`compose.json.bak-admission-5007c20` and/or
`compose.json.bak-admission-web-5007c20`; preserve later runtime changes.
Recreate only the affected services. Never restore old databases or journals
over newly accepted operations.

## Actual catalogue qualification, 02:08-02:16 UTC

The expired virtual-authenticator restore failed before submission: importing
its credentials did not preserve the PRF capability. No match was created.
The failure is retained; this is not evidence of a physical passkey regression.

A fresh virtual-Mera Chrome Classic match 264 completed and published at 0-7.
It survived F5 and 221 executed inputs. Admission including new authentication
took 16.004 seconds. Edge Chaos match 265 reused that valid grant and completed
with publication and F5, but failed the performance gate: admission was 12.521
seconds and the spectator's maximum hold was 516.6 ms. Its local input p95 was
15.8 ms, receipt p95 16.99 ms and frame p95 17.2 ms. These are actual hosted games
with virtual authentication, not physical passkey tests. All original reports
remain unchanged. See `admission-browser-5007c20-20261001.json`.

The trace identifies a repeated 1.916-second capacity check and a two-second
retry before the admitted match binding appeared. The next candidate reuses
only a healthy capacity response received within two monotonic seconds. The
sponsor and contract still verify current gates. Initial binding checks retry
at 250 ms for at most five seconds, respecting any longer remote cooldown;
active-match recovery retains its previous cadence.

The recorded Chaos stream contained an 800-ms processed-state gap. The same
trace reproduces the 516.6-ms spectator hold. Retaining a 500-ms minimum reserve
reduces it to 350.2 ms without extrapolating unprocessed state; player buffering
remains unchanged at 120 ms. This is a recorded-trace regression result, not
yet a new hosted performance result.

Portalled shared dialogs previously inherited none of the cabinet's pixel
palette. The candidate supplies the Pixel Palace frame, square controls and
44-pixel touch targets within the portal. Exact pre-fix fixture fails on its
9-pixel corner radius. Development Chrome and Edge fixtures each pass 44
checks; final built-image checks remain required.

A migration drain setting suppresses only creation of the next tournament.
It preserves progression of the current bracket, challenges and recovery.
It has not yet been activated. No active tournament may be cancelled by this
setting. Progressive policies and catalogue migration remain undeployed.

Candidate verification: 847 Solidity tests pass, eight are skipped; 830
TypeScript tests and root typecheck pass. Twenty playout tests include the
recorded failure. No final 24-hour or complete-delivery claim is supported.

## Entry candidate 45f346d, 02:39 UTC

The full-source runtime image is
`sha256:9e2f2ffb31bc8bbdcd9f58242aac4c2aba85c33d839613ef913984f60d66698a`.
Its isolated transitive import check passes. Only admission adopted it at
02:38:53 UTC with `PONG_AGENT_TOURNAMENT_DRAIN=1`; this lets tournament 12
finish and suppresses the next `begin`. No active match or financial operation
is cancelled. At 02:40:46 it had admitted the next fixture and had no module
error or restart. The human backend, engines and other roles are unchanged.

Backup `entry-20261001T0239Z` was verified off VPS before this deployment:

- agents.dump: `fed8f4f5ab81c2322395e023ff440e6bbb4472326ff8b488fac0b5a8d26f9c0d`
- operator.dump: `0f571b582a357183bf1b3a036b81b7752993ceb3bd0815a2733a484b93639575`
- runtime.tar.gz: `7adbd32bdc5d5ea580834936a96490be282c04a3cc3c80426a70f2f85d5321d3`

The read-only migration inventory had hardcoded two lanes. It now reads and
checks the actual lane count before enumerating every assigned reference.
The first three attempts remain failed: the public Monad RPC explicitly
reported `requests limited to 15/sec`. Using the existing paced read transport
completes the canonical inventory at block 67140339, with five lanes, nine
identities and twelve tournaments. This is not an Interlude quota observation.
Tournament 12 and its eight participants remain active; final freeze/import
has not started. Historical corrections still require continuity.

## Public entry and independent cost checks, 02:54 UTC

The web candidate `45f346d` passes 44 built-image Chrome and 44 Edge checks.
Image `sha256:3d8cc6a033f34aec913749efa09adbfaac26f71f83c705ec42a78f26e1a2b804`
was deployed at 02:45:46 UTC. Agent catalogue, tournaments, docs and config return
200. `challengeAdmission` remains a qualification override, not a public flag.

Actual Edge Chaos match 269 completed and published with F5 and 221 control
receipts. Admission improved to 9.962 seconds but still FAILS the 8-second gate.
Player and spectator maximum holds were 133.0 and 133.1 ms. Their frame p95 was
17.3 and 17.2 ms. Including time queued before send, input confirmation p95 was
19.80 ms with no obsolete direction observed. The first instrumented maximum
also counted an automatic neutral resend after F5; subsequent instrumentation
counts the first confirmation for each user intention, without changing the
original report. Three metric regressions distinguish queue delay, coalesced
intentions and neutral recovery sends. The historical receipt-only p95 values
do not include browser queue delay.

A remaining entry branch still read the snapshot after finding no engine
binding. That premature read could replace the intended fast retry with the
generic two-second delay. The next candidate returns to the verified binding
check before reading state. The initial development-asset trial failed before
catalogue hydration, without creating a match; its report is preserved and is
not counted as a hosted game. Built-image validation is required instead.

A bounded read-only cost scan of canonical blocks 67142190-67142489 (02:48:51
through 02:50:21 UTC) identifies 26 successful publications for our agent
arenas, costing 1.951712982 MON with maximum calldata 13,988 bytes. It does not
attribute other publisher spending to PONGIT and is not a five-lane daily
budget. The initial observer failed container network setup; the corrected
observer completed and stopped. No transfer or game was sent by this observer.

## Binding correction and entry follow-up, 03:11 UTC

The web image `sha256:d28cfc23b3d90c97285c67089123892a65bc453a4b8eccf32e02ba1a318a51e3`
from `6b24f14` deployed at 03:01:45 UTC after 24 additional built-image Chrome/Edge
checks. Public config and catalogue return 200. The previous 88 viewport checks
remain applicable to the unchanged styling. Backup `binding-20261001T0259Z` has
SHA-verified off-VPS copies of both databases and runtime configuration.

Actual Chrome Classic 273 on f202 epoch 4 finished, published, and retained F5
and all 221 control receipts. It still FAILS admission at 11.412 seconds. Local
input p95 is 15.7 ms; input-to-first-confirmation p95 is 18.41 ms, maximum 26.91
ms. Player/spectator frame p95 is 17.2 ms; maximum holds are 50/166.7 ms. There
are no observed snapshot jumps or obsolete direction confirmations. This is
virtual Mera, not a physical passkey proof. The failed performance report is
retained, with a sanitized copy in `admission-binding-20261001.json`.

The next compatible backend candidate runs at most four independent gas
estimates concurrently, preserving their original preference order and failing
closed on unresolved transport errors. It never signs estimate-only bytes.
A single block-consistent assignment batch serves all five engines every
500 ms; healthy idle loops check it every 250 ms. Command fences, publication
checks and nonce ownership remain unchanged. This trades a small increase in
shared lobby reads for removing the previous two-second assignment refresh
plus one-second idle wait; actual traffic and admission must be measured before
claiming the eight-second target. No production backend has adopted it yet.

## Assignment trial and rollback, 03:34 UTC

The bounded Chaos trial of ffc336b completed match 277 on af7c epoch 15 and
published 0-7, with F5 and 221 control receipts. It FAILS performance:
admission 10.457 s, player maximum hold 849.7 ms and spectator hold 832.4 ms.
Input-to-confirmation p95 was 19.149 ms; frame p95 was 17.2 ms. The original
report remains in artifacts/qualification/catalogue-assignment-ffc336b-chaos.
The engine image was rolled back at 03:23:18 UTC to
sha256:e1ce8273387b3e316b8b84a579e62ed4628f7638187eba6babbf27d87f3a3055.
The sponsor retains the bounded-estimate candidate
sha256:698957b5fc1f829dc1e6e8d99386c4303ebe11490ed132c206738768490eb95f.
There is no active synthetic browser driver and no journal/database rollback.

Five direct VPS header reads took 45-77 ms on the primary Monad provider and
102-115 ms on its fallback. Five equivalent gateway reads took 54-752 ms.
The shared gateway had 17 queued/in-flight requests at 03:28 and an actual
provider throttle. Its configured 50-ms primary spacing permits 20 calls/s,
above the separately observed public provider limit of 15/s. This is not an
Interlude publication or RPC quota measurement. The old independent indexer
gateway returned errors and remains a separate investigation.

The gateway incorrectly counted archive backlog when choosing the provider
for an interactive pinned read, although that read can overtake archive work.
It also treated old contract-state reads as interactive. The candidate uses
estimated dispatch delay under each existing priority/cooldown budget and
classifies old numeric-block state reads as history. Writes, pending nonces,
receipts and current authorization reads retain their existing semantics.

The assignment candidate retains the original five-second planning validity,
rather than expiring after 1.5 seconds during a slow refresh. Its batch is now
hash-pinned with requireCanonical, saving the third serial header check.
Actual command fences still expire after three seconds and are unchanged.
Eleven focused gateway/planning checks pass. The preceding full suite passes
838 TypeScript tests and root typecheck; one additional classifier regression
passes in the focused suite. Hosted performance remains to be measured.

Backup assignment-20261001T0318Z was verified off VPS before the failed engine
trial: agents 3da2748d62587f9cf6bceffef13d2017ca9ad5cb1428adfa5b7c5cda64b9bd1f,
operator 25f31f35cbf8281509582d2b94884f55df41225010b4f4f935480ada483f9305,
runtime 4ca0fde0b30fd908ed577a745d4adf657f4bdba2750b652f0bdf07c075d83903.

A separate, undeployed publication-marker candidate changes one reserved
storage word per empty epoch. The next pool requires that marker on Monad
before admission. Its contract/unit checks are not yet hosted publication
proof and it is not part of this compatible latency deployment.

## RPC priority and publication preflight, 04:03 UTC

Published source 82c57fc produced image
`sha256:fbe848fe0c376c23b245a1e1aedc68aa04a39ffbbfa0ba8bef827973519b942d`.
The gateway adopted it at 03:41:04, maintenance/archive at 03:45:50 and engines
at 03:51:35 UTC. The primary spacing is 75 ms, below the separately observed
15/s Monad public endpoint limit. No provider setting was changed. No new
gateway throttle was recorded during the next fifteen minutes; queues still
exist. The engine retains the original five-second planning validity and
three-second command fence. The failed ffc336b engine trial remains rolled back.

Maintenance traffic fell from about 254 to 126 calls/minute in the observed
windows. A nine-second, read-only diagnostic pause of the old indexer reduced
gateway history backlog but did not remove interactive latency. That indexer
was resumed at 03:55:59.725 UTC. No historical service is left paused by this
experiment. It is not a passing admission benchmark.

Actual Classic 280 passed gameplay, F5, 221 controls and publication, but failed
admission at 15.263 s. The first renewed virtual-authenticator attempt after
that failed before submitting a match: imported credentials could not renew
their PRF authorization. The original failure is preserved. A fresh virtual
Mera Chrome Classic 284 then passed both render and control gates: local p95
15.7 ms, first input confirmation p95 18.356 ms, frame p95 17.1 ms, maximum
player/spectator holds 216.9/216.5 ms, no jumps. Its 16.781-second admission
includes a new grant and is not proof of the valid-session eight-second target.
The valid-grant Edge Chaos follow-up is still running; do not duplicate it.

Tournament 12 completed normally. Its 28 unique fixture results match the pool
at canonical block 67156417. The drain still suppresses only the next tournament;
human challenges remain open. This audit does not prove finality or continuity.

The undeployed preflight now performs one deterministic storage write in an
empty epoch, journals its exact command, and requires the same marker on Monad
before the new pool admits a player. A receipt or a getter does not satisfy
this condition. It preserves the old engine modifier and historical state
encoding. The fixture measures 49,811 execution gas for the write; real hosted
execution/publication is still required. The full Solidity suite has 854 passes
and eight skips. The TypeScript suite has 840 passes, followed by an additional
artifact-path regression and 53 passing affected checks; root typecheck passes.
Artifact preflight reports arena runtime 24,505 bytes and continuing pool
32,623 bytes, within their existing reviewed budgets. Earlier oversized builds
and missing-artifact attempts remain failed evidence. No deployment is claimed.

Backup `rpc-priority-20261001T0337Z` is SHA-verified off VPS:

- agents.dump: `d0db5105c95928171cc0126bc719d335251846290c990cf477ecfa29cd2cf799`
- operator.dump: `decf4069a4ddc524a35327cfe324bd0cf0ff140e760b72f230d3810d218f9640`
- runtime.tar.gz: `94279882a51641a469a628c75fb0bae23bcec21dc3b1adfbc208b555f91ffd64`

The new runtime configuration needs a fresh final backup. All nonce authorities,
databases, previous reports and rollback images remain intact. No additional
funding request is needed. Admission, hosted difficulty migration, financial
checks, concurrency/reserve and the final unchanged 24-hour trial remain open.

## Canonical reader and admission follow-up, 04:32 UTC

Reader/sponsor image `sha256:6c6fad29224edb6810bfd7aaa78a3e16a92ad7f856c733181a5d457db1b8d68e`
(source 4fa4739) deployed at 04:19:29 UTC. Six read-only contract views matched
the previous reader at canonical block 67158951. Those observations used 40
RPC calls instead of 52, principally removing redundant headers. Three match
reads measured 0.851/1.825/1.174 s versus 1.886/2.473/2.308 s before. Separate
short samples are not a statistical p95 comparison. Full TypeScript: 844 passes;
root typecheck passes after the test literal correction in c5e8e10.

Actual valid-session Edge Chaos 285 passed gameplay, F5 and publication but
FAILED admission at 12.289 s. Confirmation p95 was 21.534 ms and player/spectator
maximum holds 199.6/199.8 ms. The subsequent Chrome Classic 286 also passed
gameplay/F5/publication but FAILED admission at 13.163 s. Its 220 confirmation
samples had p95 17.713 ms, maximum 63.28 ms; player/spectator maximum holds were
233.4/83.2 ms, with no observed jumps or obsolete directions. Both tests use
virtual Mera and the explicit atomic-capability override; the public capability
remains absent. No browser fixture is currently active.

The Windows browser clock is about six seconds behind the VPS clock. Durations
measured on the same clock remain valid; cross-host timestamp comparisons must
first account for the offset. Do not infer a delayed countdown from UTC labels
alone. Match 286 admission was journaled at server 04:20:06.799 and acknowledged
at 04:20:08.567; the engine launch followed at 04:20:09.178.

A player candidate removes repeated numeric-block headers in entry and periodic
fences, pinning lifecycle and runtime-code reads to one canonical hash instead.
An unsupported hash read fails closed without retrying at latest. Closure still
resolves uncertainty only from a canonical hub observation; no nonce or session
permission is broadened. Twenty-seven affected tests and root typecheck pass.
This player candidate has not been built or deployed yet.

An isolated empty arena `0x54fa2d221870538f26ae5bf145290c0be9be8b44`, authority
`0x5b37b623e053c55d72d71911c0743cddc3119884`, was deployed from c5e8e10 and opened
in epoch 1 at block 67162088. It cannot admit any player. The sole bounded probe
is `pongit-publication-marker-probe-c5e8e10`, with state/evidence in
`/opt/pongit/tests/fluid-20260928/publication-marker-c5e8e10` and a separate DB
`pong_publication_marker_20261001`. It uses the original operator journal for
base transactions. Its source imposes 180 seconds for hosted identification,
then 90 seconds for a real marker publication. Do not duplicate or extend it.
No success is claimed while this probe is running. Close normally afterward,
then release/seal only after the actual hub deadline. Public lifecycle workers
do not own this private authority.

Backups `canonical-reader-20261001T040915Z` and
`marker-before-open-20261001T0427Z` have hash-verified off-VPS copies. The latter
contains operator, agent and private marker databases plus runtime configuration.
All previous reports, journals and rollback images remain preserved.

## Latest unsent input and private probe outcome, 05:00 UTC

Public web `418baf5-ws` (image `20e409a61f5b`) deployed after 44 Chrome and 44
Edge UI fixture checks, root typecheck and 846 TypeScript tests. The first web
build had the wrong WebSocket path and was rejected before deployment. The
correct build uses `wss://pongit.xyz/ws`. No physical authenticator is claimed.

Actual virtual-Mera Classic 289 on f202 epoch 4 published 0-7 and survived F5.
It FAILED admission at 9.883 seconds and exposed one stale direction during
ordinary controls. Sequence 210 sent stop 10.5 ms after a new down intention;
sequence 211 followed with down. Local p95 was 16.4 ms, first-confirmation p95
18.049 ms, frame p95 17.2 ms and maximum player/spectator holds 83.9/83.2 ms.
Those good render numbers do not erase the input or admission failures.

The narrow candidate selects the latest intention after authorization and
nonce waits, and checks again after local signing. Only unjournaled, unsent
bytes may be discarded. Once handed to the transport, the exact transaction
must be reconciled. New regressions cover the second fence, nonce wait,
closing the client, changes during signing, reference/expiry changes and lost
responses. 37 affected tests, 852 total tests and root typecheck pass. The
old generic sender type remains unchanged for historical sessions.

The isolated marker probe FAILED: one POST returned 409, subsequent lookup
returned 404 and the proposed node had no DNS record within the original
180-second bound. No response body was retained for that 409, so its exact
cause is unknown. There were no engine transactions, no state diffs and no
publication. The arena was normally closed in transaction
`0x91c181bce2af161be75f985e4e3c04c603f9c786791f7767133947f851e7144c`
at block 67163300, 04:35:08 UTC. Its real release deadline is 05:35:08 UTC.
All private containers are stopped. Release/seal this private authority once,
through the existing runner and original journal; public maintenance does not
own it. Never infer that a getter or a running node proves publication.

Because the candidate migration remains unqualified, the tournament drain was
removed at 04:40:44 UTC. Tournament 13 began normally. Preserve its results and
all migration deltas; do not cancel it merely to migrate. The warm controller
code candidate d2a7964 is built but not deployed at this checkpoint.

Backups `marker-closed-20261001T0439Z` and `player-web-20261001T0448Z` are
SHA-verified off VPS. All failed attempts, old journals and rollback images
remain. Human e4eceb6 is unchanged. Public atomic challenge capability is still
absent; the real browser tests explicitly override it for qualification.


## Input deployment and hub-bound discovery, 05:25 UTC

Web 3573b79 (`505ee1ef6410`) deployed at 05:11:16 UTC after 88 Chrome/Edge
UI fixture checks. The first capture lacked the runtime home-page flags and
failed; it is preserved separately. Engine d2a7964 (`6afc3f0664b1`) deployed at
05:02:49 UTC. Its immutable controller code prefetch retains the admission
code-hash check and all command fences. The previous tournament match completed
and subsequent fixtures started normally. Human e4eceb6 remains untouched.

Actual virtual-Mera Classic 294 and Chaos 295 published 0-7, survived F5 and each
confirmed 220 unique controls with no obsolete-direction mismatch. Confirmation
p95 was 18.031/19.226 ms, frame p95 17.2 ms, and player/spectator maximum holds
182.5/167 ms and 96.9/99.7 ms. Both complete reports remain FAIL because admission
was 9.326/9.485 seconds, above eight seconds. These are two samples, not proof of
a population p95. Atomic admission is still an explicit qualification override.
No synthetic game driver is running. Backup intent-20261001T0504Z is verified
off VPS; it predates these two runtime changes.

At 05:18-05:20 UTC, both public control configurations were read from the VPS.
`control.interludelayer.xyz/config` identifies hub v3 0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e
and validator 0xa375CF27eD39491dB8302Ffc3dF4210Ad263eF43. The previous endpoint
`interlude-control.fly.dev/config` identifies PONGIT's hub v1
0x3Ef8327F69e09cf721772F345e2A887eA22cD595 and validator
0xB28E684815b095aB5Fb324214cfEa63d76F3d691, both on chain 10143. Session lookups
for all eight public agent arenas returned 404 from the new service and live
records with their pinned URLs from the old service. Directory records do not
prove a current working epoch; 028f and 40178 node probes timed out.

The pinned official deployment document confirms the endpoint split:
https://github.com/Veenoway/interlude-sdk/blob/7b3fde219d196e3851b14f1d1b0ff80c1417833f/docs/DEPLOYMENTS.md
The new endpoint forwards machine commits for old apps, not their session
lookup API. This explains the observed directory mismatch. The earlier private
409 body was not retained, so its exact cause remains unproven.

The routing fix validates hub, chain and validator before a session request,
uses only pinned service origins, and rejects redirects. It coalesces the
configuration check for 30 seconds. Existing uncertain creations preserve their
original destination and permit only lookup at the corrected directory. Neither
404 nor a live record is used to resubmit them. Wrong configuration cannot even
journal a creation. Node identity and publication checks remain independent.
The complete TypeScript suite has 858 passes and root typecheck passes. This
checkpoint does not claim that the routing fix is deployed or has qualified a
fresh publication. The private empty arena still awaits its actual 05:35:08
release deadline; its original failed report is preserved.


## Hub routing rollout and empty epoch release, 05:37 UTC

Published ffd2e7c is deployed in agents engines and maintenance, image
fb9bfc458943aca48a9d551a4f6be3e3497226ec4425a9a0deb1db2741eab548,
started 05:30:26 and 05:33:20 UTC. Network-disabled transitive entrypoint imports
reach the expected runtime namespace guard. A real built-image configuration
check resolves the legacy hub to interlude-control.fly.dev. Healthy public
arenas continue playing. The old uncertain 028f epoch 18 request is now looked
up at the correct directory; its node remains unverified, and no new POST is
sent for it. Web, other services and the human backend retain the versions above.

The private empty epoch 1 released in transaction
0x82ff7e7c966c0804a04e6e686bc32de8d8b29729b657392857837dd6ad845722,
block 67175399. Separate canonical verification at block 67175635 confirms None,
epoch 1, zero results and finalized root
0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f.
Its original failed publication trial remains failed.

Runner 5314da0 prepares an explicit second trial after this sealed recovery.
It retains the same isolated authority, original operator namespace and engine
journal, uses distinct epoch-2 operation IDs, and cannot roll over implicitly.
The separate compose-epoch2.json mounts that reviewed runner over the exact
ffd2e7c image. It has not opened epoch 2 at this checkpoint. Inspect actual
containers/reports before starting anything. The bounds remain 180 seconds for
identity and 90 seconds for canonical marker publication. No public game is
part of this trial; normal closure and actual delayed release follow afterward.

Backup control-20261001T0530Z is SHA-verified off VPS (agents e689fb721187,
operator 84eb0475b2d9, runtime c02337678933, marker dump aeaf061e994b,
marker files e86b35079286). Post-release backup control-20261001T0537Z is being
created; do not claim its off-VPS copy until verified. The local sponsor candidate
avoids shorter gas estimates after the strongest estimate succeeds; 22 affected
tests pass. It is not deployed. Admission and every remaining delivery gate
remain open; no final 24-hour proof exists.

## Provisioning consent and sponsor rollout, 05:58 UTC

The original private marker epoch 2 failed its unchanged identity deadline at
05:42:57 UTC. Correct hub-v1 control returned first POST HTTP 403, followed only
by GET 404. No engine or publication occurred. Normal close transaction
0x821b416a8a99c117dffa54150175b939962961591282b9f98679b5eb67b0ea8a
confirmed at block 67177123; actual release deadline is 06:44:46 UTC. The private
marker authority owns this recovery; public maintenance does not. Use the
original compose-epoch2.json release runner once after the deadline. Never
reopen that epoch or erase its failed report.

Sponsor 91a96ed deployed 05:50:38 UTC, image
7b529b37c620af52a81f906d477076a54eee5b915699939056569faed02ed113.
Its strongest strict simulation now skips redundant shorter estimates after
success. All nonce, gas, budget and exact signed-intent checks remain. Rollback
is the sponsor-only prior 6c6fad29224e image, not a database restore. Human
backend is untouched. Actual fresh virtual-Mera Classic 302 published 1-7,
confirmed 220 inputs with p95 17.474 ms, zero obsolete intents, and passed local,
player and spectator timing gates. Total admission 13.676 s included a new
account and remains a failed performance report; a valid-session sample is
still required. The prior restored virtual authenticator lacked PRF on renewal;
that separate failed report admitted no match and is not a game failure.

Official pinned CLI 7b3fde219d196e3851b14f1d1b0ff80c1417833f documents owner()
EIP-191 opt-in for apps the control service did not deploy:
https://github.com/Veenoway/interlude-sdk/blob/7b3fde219d196e3851b14f1d1b0ff80c1417833f/cli/src/sessions.ts
The existing arena owner() is a contract and cannot produce this EOA signature.
Candidate 0d2ee7f adds a PRIVATE derived arena whose owner() identifies only its
immutable provisioning signer; DelegatedLayout.owner, onlyOwner, pool lifecycle,
admissions, controls and result permissions are unchanged. The six generic SDK
administrative methods reject the provisioning account. Its opt-in is bound to
app and epoch, canonically checked against owner/hub/session, and sent only to
the verified HTTPS control origin with redirects refused. Consent bytes are not
logged or persisted. This is not a public ownership or migration change.

41 focused Solidity tests, 861 TypeScript tests, root typecheck, artifact graph
budgets and staged secret scan pass. The initial Solidity assertion expected the
wrong revert text; its failed output is retained alongside the corrected run.
Runtime is 24,532 bytes, below the 24,576-byte limit. Private qualification source
is mounted over sponsor image 91a96ed at
/opt/pongit/tests/fluid-20260928/publication-consent-0d2ee7f. Database
pong_publication_consent_20261001 and operation prefix publication-consent-20261001
are isolated; the original operator journal/lock still owns base transactions.
The single deploy container is running; inspect it before another action. No
consent arena has opened at this checkpoint. Its planned identity/publication
bounds remain 180/90 seconds, no players or public changes.

Backup control-20261001T0550Z, including both marker compose files and its exact
runner, is SHA-verified off VPS: agents f53cb20b23ba, operator 1ebbb55c375f,
marker dump 4a399f947444, marker files f45dd6c0c1f7, runtime 83c8d2f46d87.
Public tournament progression continues. No final qualification or 24h claim.

## Valid-session failure and private consent closure, 06:14 UTC

Actual Edge Chaos 304 on 40178 epoch 18 admitted in 9.950 seconds, above the
eight-second target. Its 124 confirmed controls had p95 19.345 ms and no stale
direction mismatch. At 06:00:44 UTC, publication batch 117 was rejected with
HTTP 429, `hourly_publication_gas_budget`. Player and spectator held for
8,783.5 and 8,766.8 ms despite frame p95 17.2 ms. Publication recovered and the
0-7 result was published. The whole report remains FAIL; no further load test
is justified by its eventual result. This is a publication budget, not evidence
of the RPC requests-per-second limit or insufficient wallet funds.

Private consent arena 0x6126f042915d5314af11c2a64737813c73edd36f opened epoch 1
at block 67180549. The owner-bound opt-in received HTTP 503 classified as
capacity, then only GET 404 until its unchanged deadline at 06:05:47 UTC. No
engine or publication was observed. Normal close confirmed in
0xc879331446fe1f7ee7af105d1fe418dd7a3daa597341ffeffc505f4272276f89,
block 67181519. Release is due 07:06:55 UTC. Its stopped, original private
runner must release and seal through the original operator journal; public
maintenance does not own it. Do not close or open it again. The older empty
54fa epoch 2 separately awaits 06:44:46 UTC with compose-epoch2.json.

At block 67181339, reserve 369158 held 518.843855926 MON, publisher B28 held
49,236.481279334931582126 MON, and archive held 89.644318055756275296 MON.
No funding request is needed. The user's latest authorization covers necessary
test-MON spending without another per-transfer approval; it does not authorize
provider configuration changes or abandonment of user matches.

Hub v3 is an investigation, not a public migration. Its canonical session read
at block 67181662 confirmed Active with expiresAt=0. Current PONGIT guards
incorrectly treat that representation as expired. Before a bounded private
publication qualification, support must retain Active/epoch/base checks and
prevent zero expiry from authorizing closure of a running game. The pinned
deployment documentation describes v3's different validator, control endpoint,
0.01 MON opening fee and no lease duration. Production retains all versions
listed above. No new private engine or browser driver is active.

## Private v3 candidate, 06:25 UTC

The candidate recognizes zero expiry only for the pinned v3 hub. Active status,
matching epoch and base block remain required, and the client lifecycle fence
still expires after three seconds. Unknown/legacy zero expiry fails closed.
Normal closure of a running no-lease match is rejected. The cold closure check
moved to the existing immutable binding library to retain the 24 KiB runtime
limit. The first size check failed and remains preserved; the corrected
provisioning arena is 24,303 bytes. Physics and all player permissions remain
unchanged. The EIP-191 provisioning signer still lacks game/lifecycle powers.

58 affected Solidity tests, 863 TypeScript tests and root typecheck pass. The
first new client test used a game operation on an empty marker fixture; that
test failure and the corrected rerun are separate artifacts. The private
qualification requires its own namespace, the pinned v3 control configuration,
canonical terms with a maximum 0.01 MON opening fee and one state-changing
marker. It records the actual canonical publication cost. No public service
uses this new code, and the remaining clients/pool/lifecycle paths are not yet
claimed compatible with v3. Its only planned hosted operation is empty-arena
publication followed by normal closure and release.

Backup control-20261001T0614Z is hash-verified off VPS: agents 942f06e178e9,
operator 95fa9d4a5b05, marker a8d58a303c47, marker files f45dd6c0c1f7,
consent d3de1965d7d1, consent files 8903f419dbe4 and runtime ed0d407862d2.

## Hosted v3 identity and marker gas failure, 06:35 UTC

Candidate f7ce4ac deployed private app 0xf455432da84858a31142055f13f166ac39fd2644,
authority 0xb5ef90e180c86dbc34a08d3f0e105f12cb553e9d and verifier
0x8d2ca37fa47aa7390cebd16cd67a35f4c6202de4. Epoch 1 opened in
0xfd3446aed0c053cda603c2e4ce7ab92ad5c6af88c4573b60bf6dcd319f21888f,
block 67185763. Canonical terms confirm zero lease, 3,600-second challenge
window and two-of-three resolution threshold. Owner consent successfully
provisioned https://il2-eu-f455432da84858a3.fly.dev. App, epoch, base block,
chain, code and rules identity checks passed. No public service changed.

The first marker command reverted at nonce 0, hash
0xae1c12d71c97f299614fea3bd4a0d0a929e71284cb8abfe21fea21b4c86e1dfe.
The journal records its failed receipt; the original report remains FAIL.
The cause is PONGIT's inherited 100,000-gas read-only probe budget. The actual
node rejects the same call at 100,000 gas, accepts 300,000, and estimates
137,154. No stateful retry has yet occurred. A batch containing the reverted
transaction was committed, but marker remains zero, so it is not a successful
state-publication qualification.

The correction budgets 300,000 gas only for the marker. Game commands retain
their existing limit. A separate bounded retry requires the original failed
journal entry, its exact failed receipt, matching intent and consumed nonce;
it creates a new operation with the next nonce and preserves original bytes.
Lost responses, missing receipts and a reused nonce cannot authorize retry.
The existing private epoch is kept open for this one diagnostic retry, not for
games. The original failed deadline/report will not be relabelled as passed.

Backup control-20261001T0627Z, including the new private state and deployment,
is verified off VPS against all nine SHA256 hashes. Original 54fa and 6126
releases remain due at 06:44:46 and 07:06:55 UTC respectively.

## Actual v3 publication passed, 06:39 UTC

The separate retry from 870fd0f executed at nonce 1, hash
0x26e267696eabfc9d05d98a8ec68c868f017433fc44fab6c73d0fc8213eb5c4cf.
It preserved the failed nonce-0 entry. At canonical block 67187454,
hash 0xa040a8c714de6dc7bece576a2e51dbbe8991ce2b5883ced894cade8115060d75,
the actual Monad marker is 1, batch count 2, match count zero and empty result
root unchanged. Hosted identity, execution and canonical publication therefore
pass for this bounded empty-arena test. The first failed attempt remains FAIL.

The state-changing publication transaction is
0x6a338060a2ea1516dad905f2f88ce141c1a23156e87b7fa10c463a10837e6e58:
964 calldata bytes, 351,040 charged gas at 102 gwei, or 0.03580608 MON.
The earlier reverted-command batch cost 0.02334015 MON. These are exact fees
for this tiny qualification, not a game-cost forecast or proof that every
publication budget problem is solved. The new path estimates publication gas
instead of using the old 24-million-gas charge for this sample.

Normal close confirmed in
0x2590a0d210ae570e1854723119562b9389c9d9a890395c622f59c88ac15b8abb,
block 67187855. Actual release deadline: **07:38:52 UTC**. Use the original
`v3-operations.py release f7ce4ac`, which owns only this empty private arena,
after verifying no prior release. Do not reopen or force-close it. No private
driver remains active. The runtime still requires full pool, player, admission,
budget, health and lifecycle adaptation before v3 can host PONGIT matches.

The marker gas correction passes 865 TypeScript tests and root typecheck.
No production service was changed by either private v3 candidate.

## Private legacy recovery and backup, 06:45 UTC

All nine files in `control-20261001T0640Z` are SHA256-verified off VPS.
The original marker runner released 54fa epoch 2 in
0x2d56d5f0cb751dc1182d3b55ee0d8624f1f9e9cd28f6dcd16dc72ac13119b2df,
block 67189090. Canonical block 67189091 confirms status None, exact sealed
empty root 0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f
and count zero. Do not repeat this release or reopen the legacy test.
6126 and f455 remain normally closing until 07:06:55 and 07:38:52 UTC.

## Candidate lease integration, 06:56 UTC

Pool admission, player recovery and controls, bridge evidence, engine scheduling,
maintenance, publication budgets and soak predicates now recognize zero expiry
only on the pinned v3 hub. Legacy and unknown zero-expiry sessions fail closed.
The three-second command fence, two-hour human permission, current epoch,
canonical code, result capture and measured batch reserve remain mandatory.
Zero expiry cannot authorize public expiry recovery or closure of a running game.
The human runtime is unchanged; its existing budget calls retain legacy semantics.

871 TypeScript tests and root typecheck pass. Ten Solidity integration tests pass,
including five concurrent assignments, reverse captures, unchanged tournament
locks and restricted closure. The first new Solidity fixture failed because its
mock froze the publication batch index; that failed report is preserved separately
from the corrected test. These are local tests, not hosted match qualification.
All nine files in the post-release `control-20261001T0648Z` backup are verified
off VPS. No candidate game, new opening or public service deployment occurred.

## Scoped v3 hosting integration, 07:02 UTC

Candidate hosting now uses a separate provisioning signer. Immediately before
a new POST, its owner, runtime and active epoch are read at one canonical Monad
hash. The signature is restricted to the exact control destination/application/
epoch. Lost POST responses keep their original journal and use unsigned lookups;
failed local checks never create a sending intent. The known v3 origin is only a
hint and must pass the existing identity/publication checks. Shared metadata
cannot contain the provisioning key. Public services retain their old runtime.

The private deployment runner can deploy five-lane v3 authorities with the
immutable progressive eight-bot policy and closed gates. Its first-game setup
can explicitly open one candidate arena, bounded by the observed 0.01 MON fee;
this does not claim five hosted lanes. All 877 TypeScript tests, root typecheck,
18 provisioning/policy Solidity tests and secret checks pass. Earlier fixture
checksum/type failures are retained. At canonical block 67191928, operator
reserve is 515.775 MON, v3 publisher 49,519.236 MON and legacy publisher
49,165.953 MON. No transfer or funding request was needed. Disk is 79.345%
before the small candidate image build. A full-game publication remains untested.

## Private full-game candidate and canonical admission reads, 07:17 UTC

6126 epoch 1 was normally released in transaction
0xda20e503a1e533bc479daf510ea218e00c7c7ce3e712856d678a712c5ec0162e.
Canonical block 67193942 confirms status None and the exact sealed empty root,
count zero. Do not repeat its release. The f455 v3 marker release remains due
at 07:38:52 UTC through its original private runner.

The first full-game v3 deployment stopped because the artifact package omitted
the inherited ReusableAgentPool ABI. Its failed container/log remain preserved.
The supplemental ABI bundle has SHA256
893040aefad8d80211c51ad17ecc7e7150bc9c4442947b926d18da57fa5388e0.
The same deployment resumed from its journal within the original deadline;
confirmed deployments were reconciled, not duplicated. Future preflight now
includes both inherited pool and arena artifacts before any deployment.

Private pool 0x550ff3c22e20fc760af9afd68fba2cb531140dc6 is deployed with seven
closed arenas, separate provisioning owner and ProgressiveHousePolicies
0x0632e55be9994a46cf9f920de9302cc8e679ac78. Its immutable candidate image is
sha256:5aa60dbc1a95507ad2df50325a5a647363f448780395d20e80d7b065241970ae,
source 6033dbe. The isolated database is pong_v3_games_20261001 and root is
/opt/pongit/tests/fluid-20260928/v3-games-6033dbe. No game, hosted opening or
public migration is established by this deployment. Both public gates are closed.

The browser candidate also reduces sequential authorization reads. Chain and
header reads overlap; family, queue and nonce checks use the same canonical
block hash. The expected family digest lets its on-chain verification overlap
the nonce read. A failed canonical read or mismatched domain cannot request a
signature, replace a saved key or silently use an unpinned read. Full TypeScript
suite: 879 passes; root typecheck passes. Browser timing remains unmeasured on
this candidate. Public services and ongoing public games are unchanged.

## Two actual v3 games passed, 07:30 UTC

First private arena 0x8194191a762a54f2a2bc05fe159e8f418cffe36e opened epoch 1
in 0xa7f6ed3401e3501df1763e0c687e3786767f6675f8a2b3b74ae64b3acf4f228f,
block 67195900. Its engine verified hosting identity and an actual published
marker before admission. Four dedicated roles received 5 test MON each through
the original journal. No transfer went to another project or a user market.

The bounded trials completed Classic 0-7 and Chaos 1-7, NOVA versus ONYX.
Both status-3 results were published and captured; their mode-specific
qualifications were checked against the contract. Admissions closed after each
trial. The original reports and command journals remain intact. The temporary
engine and archive services stopped cleanly, exit 0, after both reports and
read-only samplers completed. The other six candidate arenas remain unopened.

Read-only sampling covered 40.018 seconds in Classic and 120.035 seconds in
Chaos. Processed-clock/wall-clock ratios were 98.731% and 98.171%; snapshot-read
p95 was 106 ms and 104 ms, with no failed sample. These one-second samples do
not prove the 500 ms visual-freeze threshold, human controls or admission p95.
The 28 publications observed from the epoch start cost 2.717783574 MON, with
maximum calldata 14,692 bytes. The Classic subtotal was 1.016894916 MON for
11 publications. This remains a small real sample, not a 24-hour budget proof.

The migration runner now supports an explicitly pinned v3 target and separate
provisioner while preserving the predecessor manifest, family permissions,
identity imports, ratings, request nonces and historical index emitters. No
production migration has run. 56 relevant Solidity checks pass, including
cross-hub five-lane counter and identity continuation; the initial fixture
without deployed target-hub code failed and remains preserved. Root typecheck
and diff secret checks pass. The private recovery runner permits only normal
closure/release of these two captured results after verified off-VPS backup.

## Normal closure and browser origin repair, 07:43 UTC

The two-game v3 arena normally closed in transaction
0x3bc8dbae165559686b473f0647e5b6135ba4b650f2adff926c78fadd36432a45,
block 67198498. The actual release deadline is 08:32:28 UTC. Its verified root
is 0x2565a201d13577520c7130ff69de5bf44b150871ef45d70302ea0c13048e2918,
count 2 and 29 batches. Both private workers remain stopped; no opening,
forced closure or public migration is authorized by this recovery script.
The 11-file control-20261001T0738Z backup, including the recovery runner and
configuration, is SHA256-verified off VPS.

The empty f455 v3 marker was released at 07:39:33 UTC in
0x7614f6e3e6e755aa09c30d3c20ae3434cd14f3388272a4aaf60f5cb55be5d07c.
Canonical block 67199899 confirms None and its exact sealed empty root/count 0.
An earlier release invocation at 07:37:36 failed the hub deadline check before
creating any transaction. That original failure is retained separately.
Neither empty test may be reopened or released again.

A browser integration regression reproduced the CSP rejection of actual v3
origins. The correction permits only the exact application-derived il2-eu
origin, only with the pinned v3 hub and generation 5. Legacy origin handling
and historical read-only routing remain unchanged. Arbitrary Fly hosts, wrong
apps, ports and mismatched hubs are rejected. All 10 focused tests and root
typecheck pass; the pre-fix failure remains in the qualification artifacts.
This change is not deployed publicly and browser gameplay remains to qualify.

## Four concurrent hosted games and private browser trial, 08:08 UTC

Five additional owned v3 arenas opened epoch 1, without human capacity or
provider changes. The final spare remains unopened. Their operation records
are in `v3-games-6033dbe/evidence/five-setup-more.json`; opening fees remain
0.01 test MON per arena. The new bounded engine/archive runtime started at
07:53:41 UTC and stops no later than 08:38:41. Earlier workers remain stopped.

The original trial 3 completed at 08:01:29, before its 08:10:06 deadline.
Four concurrent real matches, IDs 3–6, published and captured results 1–7,
1–7, 3–4 and 1–7, across Classic and Chaos. Admissions closed normally.
The 3–4 result reached the actual five-minute limit. This proves four
qualification-controller games, not five concurrent human challenges or a
complete difficulty ranking. The 60-second read-only observer recorded 480
samples and no errors. Three games remained active throughout, with clock
ratios 98.10%, 98.62% and 98.80%, and snapshot-read p95 210–217 ms. The fourth
finished during sampling; its whole-window ratio cannot qualify active play.
These measurements do not establish input or graphical latency.

The actual candidate build fd74a04 passed Chrome and Edge UI fixtures at five
dimensions, including progressive levels 1–8 in catalogue order. This uses
synthetic API/engine data. The private browser admission worker started at
08:04:41 with an original deadline of 08:24:34. It admits exactly one real
browser account. Match 7 was assigned at 08:07:15; its result and rendering
remain pending. Initial challenge creation uses the wallet harness, not the
public catalogue, and the PRF authenticator is virtual.

The first browser transport attempt failed before admission because SSH TCP
forwarding is disabled; its log and private account file remain preserved.
The resumed browser uses the existing scoped SSH stdio bridge with unchanged
request/response bodies. No SSH configuration changed. Private reader/sponsor
services started at 07:59:21 with original stop deadline 08:39:21. They are
loopback-only and use the isolated database and scoped sponsor. Public runtime,
identities, ratings and financial contracts are unchanged.

8194 epoch 1 remains normally closing; release is not permitted before
08:32:28 UTC and additionally requires idle lanes and closed admissions.
No release worker runs. Do not repeat f455, 54fa or 6126 releases. The original
operator journal remains the only lifecycle authority.

## Actual Chrome/Edge controls and v3 release budget, 08:25 UTC

Browser attempt 1a became an observer because the injected localhost relying
party differed from the production build's pongit.xyz relying party. Match 7
normally cancelled at 0–0; both failed reports remain failed. The corrected
harness preserves the built relying-party origin and redirects all site and
API requests inside that isolated browser to the private services. It does not
alter Mera derivation, production routing or the live user's browser.

Actual Chrome Classic match 8 and Edge Chaos match 9 both finished 2–7,
published and captured. Canonical match views confirm their respective modes.
Both used the real Mera implementation with a virtual PRF authenticator, 110
direction changes and F5 without another ceremony. Chrome's local movement p95
was 15.7 ms, send/receipt p95 14.60 ms, player/spectator frame p95 17.1/17.2 ms,
and maximum holds 317/299.9 ms. No reconciliation jump was observed.
Edge's full input-to-confirmation sample, including the local command queue,
contained 219 confirmations: p95 20.77 ms, maximum 179.61 ms, no mismatched
direction. Local movement p95 was 15.7 ms, player/spectator frame p95 17.3/17.2
ms, holds 167/166.3 ms, no observed jump or frame gap over 500 ms. These short
desktop samples pass the measured thresholds; they are not catalogue admission,
physical mobile or continuous availability proof.

The next controller trial 4 failed before any game admission because completed
browser queue records still require the normal priority scan. Its gates closed
and its failure is retained. The isolated driver now reproduces that scan only
with challenge intake closed, at most 32 records and every request already
cancelled/completed. It must create no match. Actual waiting requests stop this
fixture. Trial 5 is the sole current driver, deadline 08:32:22 UTC, four games.
This correction changes qualification tooling, not production priority rules.

A read-only fork of actual v3 hub bytecode
0xe84c1d8f41ad688955549a1cc245d6908bcd44e44709335769284d832e5a61ef
passes release after 2,000 and 16,000 batches over 256 distinct overlay slots.
The larger test includes 32 dense 1,233-byte transactions per batch. Release
uses 82,088 gas before refunds in both samples, within the 30-million bound.
This is simulated local publication on copied bytecode, not hosted throughput.
An additional 4,096-slot test checks that release preserves every published
value. No production budget or private 2,000-batch guard was raised.

All 11 files of control-20261001T0809Z are SHA256-verified off VPS. The backup
includes new worker configs, candidate/operator databases, scoped keys, journals
and evidence; newer browser/driver reports still require a final refresh.
Original engine/archive stop time remains 08:38:41; reader/sponsor 08:39:21.
8194 release remains no earlier than 08:32:28 and only when lanes are idle.

## Five simultaneous matches and catalogue qualification, 09:03 UTC

The old bounded workers stopped at their original deadlines. Trial 6 finished
at 08:36:44 with four published results, completing the eight house agents'
Classic and Chaos mode qualification. This does not establish a statistical
difficulty curve. The 8194 epoch 1 normal release completed at 08:37:37 in
0xf7b6e965d9c7d0c42138cb00b0da113d094f9480adf29bde23e199c71908c33b.
Canonical block 67211431 confirms None, the exact previously recorded root and
two sealed results. Do not repeat this release or the earlier marker releases.

Five-concurrent trial 1 failed: a control authorization expired while its
prefetch or initial nonce read completed. All five matches subsequently
finished and were captured normally; the original failed report is retained.
Commit a32aec0 refreshes an expired successful prefetch once and retries only
a typed, definitely unsent fence failure. The three-second fence remains
unchanged; network uncertainty still uses the existing nonce journal.
All 32 player tests, 883 TypeScript tests and root typecheck pass.

Trial 2 passed at 08:55:04.450. Tournament match 23 and four friendly copies of
the same archetype (matches 24–27) overlapped for 33,893 ms. Every controller
sent 100 direction changes; confirmation p95 was 144.40, 212.74, 157.93 and
211.24 ms. All five results published and were captured. Tournament score was
7–2; challenges ended 2–7, 2–7, 1–7 and 1–7. These are actual hosted games with
synthetic owners, not browser, physical-passkey or continuous-service proof.
Evidence: v3-games-6033dbe/evidence/five-concurrent-2.json. The first failed
trial is unchanged. Private pool 550f remains a fresh season, not a migration.

The sole catalogue window is pongit-v3-catalogue-window1-7416e8c, started
08:55:47 with original deadline 09:13:47. It opens only private actual gates,
expects exactly two browser requests, Classic and Chaos, and closes on success,
failure or deadline. Do not run another admission fixture concurrently. Its
ready time is 08:56:21.576. Two browser setup attempts failed before creating
any request: the first before readiness, the second because local web runtime
homepage flags were absent. Their reports remain failed. The corrected actual
build runs locally on 4197 with private API routing via SSH stdio; production
and SSH configuration are unchanged. Chrome attempt 3 is now running.

Private catalogue reader/sponsor started at 08:55:57 and stop at 09:15:57.
Engine/archive workers started at 08:38:57 and stop at 09:28:57. These deadlines
must not be extended. Reader metadata enables only private preview with a real
five-match evidence hash; qualified remains false. Original metadata is
unchanged. All 11 files of control-20261001T0857Z are SHA256-verified off VPS.
They include original operator and private databases, scripts and journals.

Migration preparation now permits deployment of unimported modules/policies
while the source remains active, then takes the final snapshot at startImport.
Seventy targeted Solidity tests pass. No public migration is deployed. The
import-dependent pool and qualification sequence still require validation.
Source 7416e8c is published; the browser finally-handler has a local change to
preserve its report when saving a failed authenticator also fails.

Remaining gates include real catalogue timing, all four complete tournament
formats, seven-way human/agent overlap, reserve and renewal, compatible final
migration, finances/replays and the unchanged 24-hour trial. Public human and
agent runtime remain unchanged during these private tests. No funding request
is needed; the user authorizes necessary test MON spending without repeated
approval. Existing signer journals remain authoritative.

## Real catalogue observations and fixture transport correction, 09:12 UTC

Classic Chrome match 28 completed 2–7, published and captured. F5 and 220 input
confirmations passed; confirmation p95 was 17.86 ms, local response 15.9 ms,
player/spectator frame p95 17.2/17.1 ms and maximum holds 366.9/366.4 ms.
No correction jump was observed. The full first-account admission took
17.491 seconds and fails the eight-second gate; it includes first authorization,
so it is not a valid-session measurement. The report remains failed overall.

The following Edge setup failed before any POST or challenge. The private JSON
bridge buffered SSE responses indefinitely, exhausting its four read workers.
Actual API requests then timed out at 25 seconds. This is a qualification
transport failure, not evidence of production latency. The bridge now rejects
SSE explicitly, allowing the application's real bounded polling fallback;
engine WebSockets remain direct. This limitation is declared in subsequent
reports. No production endpoint or response content was changed. A new bounded
Edge Chaos attempt is running within the original catalogue-window deadline.

## Catalogue follow-up, renewal and RPC priority, 09:44 UTC

All three private catalogue windows finished normally and closed their gates.
Their six actual browser games published and were captured. Chrome Classic 28
and Edge Chaos 29 included first authorization (17.491/18.301 seconds). Restored
valid sessions in Classic 30 and Chaos 31 took 11.073/10.131 seconds. Deferring
portraits until the first court state in 9fe76fa gave 9.909/10.263 seconds for
Classic 32 and Chaos 33. Every sample still fails the eight-second target.
The private SSH bridge deliberately rejects SSE, using real polling fallback;
engine WebSockets remain direct. These are virtual-PRF tests, not physical keys.

Across games 30–33, confirmed command p95 was 18.06, 20.96, 18.39 and 18.42 ms.
Classic 32 nevertheless held the player/spectator display for 800/616 ms and
fails the 500-ms gate. Chaos 33 held 250/233 ms. Keep every failure; neither
fast receipts nor a later passing sample proves uniformly smooth rendering.
The catalogue2 service setup exited 127 due a malformed fixture command before
any player submission; its original reports/configuration remain preserved.
Corrected catalogue3 reader/sponsor stopped at their original 09:36:30 bound.

The 8194 epoch 1 release was already complete. A separately journaled renewal
in 645b158 confirmed epoch 2 at block 67222247 in
0x83b7116ae7258177e835f88183d2bb1a5281a39885d74cce8d28bf29f85a7068.
The old sealed root and count two remain exact. The private archive balance had
fallen to 0.923846216 test MON; the authorized reserve supplied 10 MON in
0xb0ec8f6b33dfb3a30bf57de2adc88f05cef0fe830f683f1ac393273d8b75ad80.
No user funding request or public runtime change was needed.

Actual renewed match 34 finished 7–1, published and captured. The sole private
tournament1 driver started 09:32:55 with original deadline 10:12:55.698 UTC;
engine/archive workers stop 11:12:55.698 UTC. Configuration is
v3-games-6033dbe/tournament-runtime-645b158.json. At 09:41, four Classic
elimination fixtures were published and match 36 was active. Do not duplicate
drivers or extend bounds. No lifecycle worker runs. Arena 5472 remains unopened.

The actual shared gateway is pongit-rpc-1, image 82c57fc, with primary/secondary
spacing 75/85 ms, not the old 400-ms setting. At 09:38 it had 21–27 outstanding
reads, 3–7 interactive requests queued per provider, and zero recorded throttles.
Its classifier recognizes historical number tags but treats old EIP-1898 hash
reads as interactive even after observing their old header. The candidate now
remembers at most 2,048 header identities for scheduling only. It preserves all
canonical flags, nonce ownership, provider pacing and archive fairness.

The actual isolated HTTP test reproduces the defect on the old image and passes
on the candidate. Both reports are retained under
/opt/pongit/tests/fluid-20260928/gateway-hash-20261001/{baseline,candidate}.
This uses a synthetic local upstream with network disabled; it is not a hosted
latency claim. Thirteen targeted RPC tests and root typecheck pass. The gateway
correction is not deployed publicly.

All eleven control-20261001T0927Z files are SHA256-verified off VPS. They precede
the renewal and tournament-worker configuration; refresh those before final
delivery. Public human and agent deployments remain unchanged. Disk is 81%;
another image build requires scoped cleanup first. Remaining migration,
championships, human/agent overlap, finance/replay and unchanged 24-hour gates
are still open. The private fresh season must never replace existing identities.
