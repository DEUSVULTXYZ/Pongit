# Readiness and recovery qualification, 20 September 2026

Public production remains `7d35926`, with human, Agent Arcade and tournament
admissions closed. This checkpoint does not authorize reopening. No unchanged
final 24-hour trial has begun.

## Follow-up at 13:05 UTC

The corrected Edge fixture `browser-chaos-ready5` passed against the actual
private rules-13 deployment and unchanged web `359523f`. Three original virtual
Mera PRF accounts joined a Chaos room; both players and the spectator saw 3/2/1.
The spectator made a root-signed live test-MON bet. F5 restored the same player
authorization. The two players sent 68 and 70 confirmed movement/release inputs,
and the game ended naturally 7-4. All five layout widths passed. This is not
physical-authenticator testing, 100 direction changes per player, rules-14
qualification or evidence of continuous capacity. The failed run 4 is retained.

The first hosted reusable rules-14 fixture admitted four new identities after
the engine opened, then ran Classic and Chaos sequentially in arena
`0x60cb8c03a2f4f0900b72788680df24e994a2ea30`, epoch 1. Classic's result was
published and captured. Chaos accepted two actual drand proofs and finished by
concession, but the driver stopped at its Monad capture because another writer
temporarily owned the operator journal. The original report remains failed.
The next driver waits only for explicit pre-submission journal contention and
reconstructs confirmed inputs/proofs on restart. It never changes an uncertain
operation's ID, nonce or signed bytes. No production gate was changed.

## Follow-up at 11:00 UTC

Private human web `359523f` started at 10:50 UTC; public production is unchanged.
Its Edge Chaos fixture `browser-chaos-ready3` failed at 10:55 UTC. It did verify
three real room members, both consents, all three countdown digits on players
and spectator, and a root-signed live test-MON bet. It recorded **zero movement
receipts**: the driver waited for the spectator's funding and signature before
controlling either paddle, and the real game finished 7-6 in the meantime.
This is not a gameplay pass. The driver's injected audio preference also threw
on its deliberate `about:blank` disconnect, where storage is unavailable.

The next fixture drives both players concurrently with the spectator's financial
actions and limits its preference injection to the actual site origin. The
original failed report, receipts and screenshots are preserved. Live SDK run 7
waits for two actually released arenas and must not compete with a new browser
for either reservation. It adds bounded read-only timeout recovery and payload-free
RPC timing; no signed command is retried on an uncertain response.

## Follow-up at 10:35 UTC

Private human web `42c7cf0` and sponsor `e6174aa` are running. The simultaneous
`events-live-6` fixture obtained both admissions and both readiness receipts per
arena, then **failed before any movement** on a read timeout while the launch
deadline was not yet armed. Both games subsequently ran without fixture control;
their results cannot count as gameplay passes. The preserved report lacked
method-level timeout evidence. Read-only probes made after the arenas closed
cannot establish the cause of the earlier interruption.

The next driver records payload-free RPC timings and applies the same bounded
read recovery to launch-clock reads as to snapshots. Read timeouts and actual
`Retry-After` delays are recorded, never used to retry a signed command. Persistent
failures, unknown errors and a retry delay beyond the fixture budget still fail.

The shared Monad gateway also incorrectly put current-block reads behind old
block downloads. The source correction prioritizes current headers and transaction
reconciliation, preserving the existing shared rate and fairness to history. An
isolated real HTTP integration passed with twenty archive reads queued ahead of
a current header and transaction lookup. Its upstream was synthetic and network
access disabled. An earlier fixture incorrectly treated HTTP arrival spacing
under CPU throttling as dispatch timing; that failed report is preserved. The
corrected integration verifies ordering and whole-burst pacing; a fake-clock
test separately checks every dispatch interval. No running gateway was changed.

The full TypeScript suite passes 508 tests, and type checking passes. These new
source corrections still need their private deployment and hosted recovery checks.

The isolated rules-13 human build `a788eb5` adds participant readiness before
the contract's three-second countdown, faster preparation of sponsored consents,
a fresh EVM nonce read between a confirmed readiness receipt and gameplay, and
explicit reporting of unreachable hosted arenas. The existing operator nonce
journal is unchanged. Uncertain signed transactions are never replaced.

Chrome and Edge each passed ten browser fixtures, using the actual private
Next.js build and synthetic contract/API responses. They cover both modes at
360, 390, 768 and 1440 pixels, plus 844 × 390 landscape:

- Exactly one readiness acknowledgement, followed by all three countdown digits.
- A fresh nonce observation before movement, valid direction and release inputs.
- Visible 16:9 courts, no horizontal overflow and no court movement when effects change.
- Victory presentation and background scroll locking.
- Reduced motion at 390 pixels.

The Chrome mobile Chaos and desktop Classic captures were visually inspected.
The reports are `ready-1bbb6b7/chrome.json` and `msedge.json` under the private
`diagnostics/independent-ui-ready/independent-ui` directory. These fixtures do
not prove hosted gameplay, wallet recovery, touch hardware or physical passkeys.
TypeScript passed. The prior `7035ebd` full TypeScript run passed 501 tests;
the later changes add provisioning presentation and qualification instrumentation.

Real hosted evidence remains separate:

- The first rules-13 browser match reached a published 5-7 result and displayed
  the countdown on both players and the spectator. The second player's movement
  failed with a nonce disagreement. That original report remains failed.
- The subsequent synthetic two-match run accepted both pairs after the sponsor
  preparation fix, then exceeded its four-minute hosted-identity wait. Delayed
  public IPv4 records appeared later. The two unready matches cancelled at 0-0,
  with zero winner, and each published two batches on Monad. Both cancellations
  were captured by the ledger and verified at 08:12 UTC. They are not played-match
  passes. See `INTERLUDE_IPV4_DIAGNOSTIC_20260920.md`.
- The next synthetic run waits for two genuinely released arenas before
  registering its temporary families. The browser waited for one.
  Neither waiting time nor a running test container is a successful qualification.

The second real Chrome run passed at 08:55 UTC on the unchanged private
`a788eb5` build. Arena `0xdf06ff134d0969bba67d861cab8dee538e124976`, epoch 2,
match `340282366920938463463374607431768211470`, finished naturally at 7-6.
Both players and the spectator observed 3, 2, 1; F5 restored control without
another root passkey assertion. The players received 68 and 75 accepted input
receipts, including releases. These are not 100 confirmed direction changes
per player. The final score matched all three browsers. No RPC errors or HTTP
429 appeared in the captured Interlude responses; this is not a whole-VPS
traffic measurement or proof that throttling cannot recur.

The result was independently read from the Monad ledger at 09:03 UTC: the first
and current captures agree on 7-6 and hash
`0x7e179ee0f6b6f09d8b8f9711c10d121e94c5bb56319a3cc046fc732e289213df`.
The arena closed after 53 batches and is awaiting its actual release time,
09:54:51 UTC. The capture is still contestable. Original reports remain under
`human-ready-events/artifacts/independent-candidate/browser-ready2` in the private
diagnostics directory. The result screenshot was visually inspected. The
temporary remembered-account screen during F5 resolved during normal loading;
it was not a lost session.

Still required: simultaneous Classic/Chaos matches with 100 confirmed changes,
real Chaos browser and financial checks, original-passkey renewal, eight qualified bots,
all tournament formats, verified reserve capacity and publication/release limits,
the unchanged 24-hour trial, verified production migration, fresh off-VPS backups
and progressive public deployment. Every earlier failed report is retained.

At 09:09 UTC, `events-live-4` failed before gameplay: the second consent mined
at timestamp 1789895351, two seconds after proposal 340282366920938463463374607431768211472
expired. A historical call at its receipt block confirmed `proposal expired`.
Both requested arenas were available. Both consent operations had entered the
sponsor queue at 09:08:57, but receipts arrived at 09:09:04 and 09:09:11. This is
an acceptance-latency failure, not successful simultaneous gameplay.

The sponsor now shares its one in-flight latest-block observation with viem's
public fee estimator. It retains fresh per-transaction observations, the
pending/latest nonce guard, gas limits and the sole operator journal. The live
fixture retains its registered grant like the browser, while still validating
the current onchain authorization before signing; it records preparation and
confirmation timings. Eight focused tests passed, including actual viem custom
transport counts, concurrent reads, fee fallback and rejection guards. A fresh
hosted run is required; the failed run is not rewritten.

Separately, the original agent Chrome PRF context survived its real two-hour
expiry and renewed at 09:17:05 UTC with the same account. Its subsequent game is
still pending. The complete `series-browser-11` report remains failed because
its earlier Chaos round timed out and no fault injections were completed.

The next bounded read-only command path removes the large full-block response
from command preparation: authorization, nonce and the EVM timestamp are fetched
in a block-pinned Multicall3 call after a fresh block-number read. It still checks
the full current family identity and expiry. Its actual-viem transport regression
requires exactly those two RPCs and refuses a failed read.

`events-live-5` accepted all four consents, but failed during readiness because
an HTTP snapshot lagged the applied stream. It sent no gameplay inputs; its
result is not a pass. The fixture now performs bounded fresh reads for those
explicit resynchronization errors without repeating a confirmed send, records
each retry and counts confirmed input receipts independently. Persistent stale
reads still fail. This does not change the production snapshot/reset policy.

The original agent browser's post-renewal challenge exceeded its eleven-minute
wait and later completed without browser control. Run 11 therefore remains
failed despite its separately successful original-PRF renewal. Future browser
fixtures record the actual arena wait and allow the protocol exit window to
complete. A longer fixture timeout does not qualify continuous service.

The read-only hosted benchmark passed at 09:35 UTC using an existing disposable
family. Three paired preparations measured 4,633 / 4,263 / 3,839 ms on the prior
path and 726 / 420 / 119 ms with the pinned multicall. Every new deadline was
independently checked against that exact block's timestamp. The new path sent
one `eth_blockNumber` and one `eth_call`. These three observations are not p95
latency, a load test, or proof of complete acceptance latency.

The full TypeScript suite passed 504 tests after these changes; the focused
snapshot/authorization/fee suite passed 24. The separate real PostgreSQL sponsor
fixture passed seven checks, including forty concurrent requests, nonce-journal
recovery and unsigned-consent priority. No RPC write was sent by those database
tests. Production remains closed. The private human service runs `e6174aa`;
the compact command helper is awaiting the new `42c7cf0` web build and the next
hosted fixture. Existing successful `a788eb5` browser evidence is not relabeled.

Fresh fixtures launched at 09:35 UTC: human `events-live-6` waits for two actual
released arenas before registering any families; agent `series-browser-12`
uses a fresh original virtual PRF and the earlier fault-injection sequence.
Neither a queued fixture nor its waiting time is a successful qualification.

## 11:44 UTC: hosted movement, final-point race and payment evidence

`events-live-7` remains **failed**, preserving the original outcome. Its Classic
game finished naturally at 7-6 after 133/129 confirmed direction changes. Its
Chaos game recorded 130/131 confirmed changes, four real effects (14,19,5,17),
both bets and transported pressure, then failed on a tick racing the last point.

A separate read-only follow-up verified the actual Monad publications and their
rating-ledger captures. Classic hash:
`0x1376b5ad4f09be8989e108f2558c3dd9fda3fa58e0e0c2ec12a43345cca462dc`.
Chaos finished 5-7, hash:
`0x5e04ec8be7810fec7d08cab5a5e25f24f1cf6c0fe8fae4c02e2ec419a3dc2626`.
The rejected Chaos tick has a confirmed reverted receipt at nonce 182,
`0x07f8f9b474d0d5853081596615cd97f50d5c3f742a90035735039080d0195672`.
Neither participant journal has an unresolved command. The automatic payout is
completed: 0.006 test MON, matching the beneficiary's balance. Initial/current
published ledger entries match for both games.

Measured send-to-receipt p95 values were 116.8/135.7 ms for Classic and
176.9/178.7 ms for Chaos. These are actual synthetic-controller samples, not
browser render latency, simultaneous-play proof or a final soak measurement.
The games were prepared serially and did not establish overlapping live play.

The candidate now reconciles only a confirmed `InvalidMatch` revert with a
cleared journal and a fresh terminal read of the same match. Missing responses,
other reverts and unresolved commands still fail. The next fixture prepares both
games before readiness, records actual playing intervals and requires overlap.
Its report writes are serialized and atomic. The original failed report is not
rewritten. The corresponding agent player correction awaits a new private build;
the existing browser run stays on its frozen build.

The full TypeScript suite passed 513 tests and type checking passed. The separate
reusable admission/result/storage candidate passed 16 Solidity tests offline;
see `../REUSABLE_ARENAS.md` for the explicit remaining integration and hosted gates.

## 12:30 UTC: browser outcomes and reusable candidate

The original `series-browser-14` passed with a fresh virtual Mera PRF, F5 using
the same scoped key, a lost write response, an injected pre-send 429 and subsequent
confirmed movement. Classic ended naturally 0-7; Chaos was conceded at 0-4.
No physical authenticator or natural Chaos seventh point is claimed from it.
F5 page loads took 1081/1082 ms and usable controls 3974/3872 ms. The report records
aborted session reads and temporary timeout messages despite no final errors.

Human Edge `browser-chaos-ready4` remains FAILED. Its actual game reached 7-6,
with 72 accepted input receipts, countdown 3/2/1 on three pages, a live root-signed
bet and F5 without a second root ceremony. The final fixture attempted to read
sessionStorage on a deliberately disconnected spectator's `about:blank` page.
The driver now preserves the last origin snapshot; the original failure is kept
and a passing rerun is still required. The two-arena live-8 fixture remains
separate and must not compete with a new browser match for its required capacity.

Reusable rules-14 contracts now integrate fixed-slot physical play, authoritative
Monad tickets, published Merkle results and immutable first-payment settlement.
Forty isolated Solidity integration/regression tests passed, including false
bridge admission rejection and payment after slot reuse. These are not hosted
qualification. The existing full TypeScript suite passed 517 tests before the
new explicit-epoch command/journal extension; that extension requires its own
subsequent run. Public admissions remain closed and no final soak has started.
