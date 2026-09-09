# Engine throttling and result recovery

Reviewed 9 September 2026. Runtime change: `918755d9c62d791cfd491522733461efa31cb6da`.

## Incident evidence

The production coordinator recorded and published three ranked results for the two reporting players at 14:08:36, 14:09:22 and 14:11:22 UTC. Their scores were 3:7, 7:6 and 7:6. The later two results existed despite one browser still showing 6:6. The engine journal contained 232 observed jobs and no unresolved jobs at inspection.

A bounded earlier probe on the same Fly endpoint received HTTP 429 after 59 successful closely spaced reads, with `Retry-After: 10`. Six subsequent reads spaced one second apart succeeded after the cooldown. This does not establish a contractual quota or its IP/caller scope. Production browser RPC failures were not logged centrally, so the exact failed request in the screenshot cannot be attributed to HTTP 429 from server logs alone.

## Corrections

- Separate coordinator availability from direct gameplay observation. A coordinator outage no longer disables the only live-state reader while the browser can still reach the engine.
- A confirmed `InvalidMatch`, `StaleInput` or `CatchUpRequired` game revert starts observation recovery without invalidating the game grant. A final tick can race the opponent's seventh point.
- An uncertain submission still stops writes. The account and last snapshot remain available, so later reads can trigger the result transition. No uncertain transaction is automatically replayed. Continuing an unresolved active game requires an explicit reconnect to refresh the SDK transaction nonce.
- Share the node's HTTP 429 cooldown across SDK methods. Reject calls locally during that period, without queuing signed writes. Coordinator maintenance also honors this backoff and emits a bounded, nonsecret diagnostic.
- Pace idle state reads at 250 ms and idle ticks at 300 ms. Reuse a recent observation; releases and reversals bypass idle pacing. In the deterministic one-second lane fixture, ten 100 ms timer opportunities produce four idle writes and eight reads. The previous unpaced lane produced ten writes and twenty reads under that fixture. This is a software request-count comparison, not an end-to-end latency benchmark or a guarantee against throttling.
- Ignore stale lobby HTTP responses after a newer refresh or account change.
- A successful invitation send remains acknowledged when its following read fails.
- Display the per-match `ratingChange` from the engine rather than subtracting a cached leaderboard value and prematurely showing `ELO +0`.

## Validation

TypeScript checking and the production Next.js build passed. The focused suite passed 26 tests covering the lane, transport gate, snapshot decoding, presentation and room rules.

`scripts/rooms-recovery-browser.ts` ran against the candidate web image in an isolated, internal VPS Docker network. All API, engine RPC and base-chain responses were mocked; no real grant or transaction was sent. Desktop and mobile scenarios covered a confirmed game revert and an unknown submission, followed by a read receiving HTTP 429. Both recovered the 7:6 result without reconnecting, preserved the result transition, and displayed the fixture's exact ELO +16. Observed cooldowns were 10,096 ms and 10,035 ms. No JavaScript page errors were recorded.

These scenarios verify frontend recovery, not the hosted node's sustained multiplayer capacity. A complete live multi-arena load test and smooth play under the provider's current quota remain unproven. There are no contract, physics, financial permission, manifest, database or grant-version changes in this release.

## Operations

Before release, backup `20260909T142928Z` was completed and copied to protected storage outside the VPS with dump checksums verified. The previous runtime images remain available: `pongit-web:chaos-fly-3a4141a-r2` and `pongit-relayer:chaos-fly-3a4141a`. Returning to those images uses the same active Fly deployment and database, without restoring old financial journals or the expired Classic engine.
