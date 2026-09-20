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
  failed with a nonce disagreement. The overall report remains failed. A new
  real-browser run must validate the cache-boundary correction.
- The subsequent synthetic two-match run accepted both pairs after the sponsor
  preparation fix, then exceeded its four-minute hosted-identity wait. Delayed
  public IPv4 records appeared later. The two unready matches cancelled at 0-0,
  with zero winner, and each published two batches on Monad. Both cancellations
  were captured by the ledger and verified at 08:12 UTC. They are not played-match
  passes. See `INTERLUDE_IPV4_DIAGNOSTIC_20260920.md`.
- The next synthetic run waits for two genuinely released arenas before
  registering its temporary families. The next browser run waits for one.
  Neither waiting time nor a running test container is a successful qualification.

Still required: real corrected controls and simultaneous Classic/Chaos matches,
spectators, financial settlement, original-passkey renewal, eight qualified bots,
all tournament formats, verified reserve capacity and publication/release limits,
the unchanged 24-hour trial, verified production migration, fresh off-VPS backups
and progressive public deployment. Every earlier failed report is retained.
