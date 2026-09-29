# Synchronization and difficulty — 29 September 2026

The user prioritizes smooth controls, a genuinely easy NOVA, a progressive bot
difficulty curve and removal of preview/no-prize UI notices. Public V5 is already
open; its backend qualification status remains honest when those notices disappear.

## Confirmed defects

- Inputs were deduplicated against **processed** paddle direction. During bounded
  catch-up, an accepted queued direction differs from that state. A release could
  be silently dropped, leaving the paddle moving until another command arrived.
- Periodic permission reads occupied the command lane. A read-only hub failure
  discarded a valid sender and its known nonce, requiring a complete handshake.
- Chaos prediction hid both balls after a speculative goal, before confirmation.
- F5 could resume an old direction without sending the newly neutral local intent.
- House policies perfectly predict reflected intercepts even for NOVA. Its small
  target error and 280 ms reaction do not provide a beginner experience. The
  deployed policy and arena references are immutable; labels alone cannot fix it.

## Compatible candidate fixes

Receipt-confirmed intentions now own input deduplication. Fresh contiguous events
serve movement without awaiting a routine full read. Periodic permission
observation no longer holds the command lane; failed read-only fences retain the
sender but **still prohibit writes after the original fence expires**. Recovery
sends neutral unless a more recent local intention exists. Exact uncertain hashes,
nonce reconciliation, revocation and epoch checks remain enforced.

Chaos holds the ball immediately before a predicted goal, without inventing a
score, new serve or effects. Catalogue/tournament preview and financial boilerplate
are removed; actual technical qualification flags are unchanged.

## Evidence before deployment

- Real public Chrome/virtual-PRF Mera challenge 185, Chaos/NOVA: F5, over 100
  actual controls, concession and published result. Local response p95 15.8 ms;
  executed receipt p95 17.87 ms. The measurement now includes the executed receipt
  returned directly by `interlude_sendTransaction`; it is not just HTTP latency.
- Read-only observation of Chaos 183: 40 samples, 22 pushes in 10.2 seconds,
  processed-state lag 0–70 ms. This short observation is not a continuous SLO.
- Spectator baseline on 185 **failed** its full 60-second motion window (2,067 ms
  hold). It included preparation and a deliberately conceded short fixture.
  The failed report remains; it is not reclassified as a passing live window.
- 53 targeted TypeScript tests and root typecheck pass. The first full suite had
  one expectation fail after the new neutral recovery command; that expectation
  was corrected and the targeted suite rerun. Full suite is to be repeated.

Backup `sync-20260929T0145Z` contains agent/operator dumps and private runtime;
off-VPS SHA verification is required before changing the public web. Previous
images, databases, results and failed qualification reports remain preserved.

Difficulty migration and real after-deployment checks are still pending at this
checkpoint. Do not claim the complete user request is delivered from this patch.
