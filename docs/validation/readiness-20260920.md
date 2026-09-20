# Readiness and recovery qualification, 20 September 2026

Public production remains `7d35926`, with human, Agent Arcade and tournament
admissions closed. This checkpoint does not authorize reopening. No unchanged
final 24-hour trial has begun.

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
