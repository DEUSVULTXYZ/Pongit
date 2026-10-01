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
