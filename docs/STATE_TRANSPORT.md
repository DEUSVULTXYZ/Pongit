# State transport and recovery release

Reviewed: 2026-09-09. Monad Testnet only. No contract, physics, betting rule or account derivation changes.

## Implemented

- One applied-event WebSocket per active browser tab and one shared server subscription. Successful receipt snapshots and pushed snapshots use the same deployment-scoped cache. Full reads recover missing metadata, revision gaps, reconnects and a consistent engine reset. A reset stops writes until the existing SDK session refreshes its nonce.
- A ten-second consistency read during healthy streaming; serialized fallback reads and shared `Retry-After` backoff. The SDK remains the only signer for browser inputs. No uncertain transaction is silently replaced or retried with another nonce.
- Primary-player ticks, backup takeover and a slower server fallback. The server's engine journal has a single serialized writer shared by ticks and Chaos checkpoints.
- Lobby evidence is read outside PostgreSQL locks and checked against the current immutable offer before use. Presence has its own table. Conditional private notifications replace repeated unchanged updates. Temporary authorization-provider errors preserve the local session and reject unverifiable actions.
- Result/history work and Chaos maintenance no longer retain the live lobby transaction. Pending result processing is durable in `il_result_pending`.
- Private seven-day diagnostics separate browser instances and the server, network requests, cached reads, cooldown rejections and WebSocket activity. Samples contain no request parameters, signatures, cookies, keys or private notes. There is no public diagnostics read endpoint.
- A halted publication relay is reported as `ENGINE_PUBLICATION_UNAVAILABLE`, not a player passkey error or an HTTP 429. The exact pending transaction remains in its journal and recovery slows to 30 seconds.

The adapter follows the public [SDK applied-event protocol](https://github.com/Veenoway/interlude-sdk/blob/main/sdk/src/watch.ts). The installed signing SDK remains at 0.1.1; its signing and session implementation was not replaced.

## Validation and measurement scope

The initial comparable two-browser run used real Chromium pages and the candidate web image on an isolated VPS network. RPC reads had a simulated 30 ms delay and writes a simulated 100 ms delay. These numbers are **not a capture of production traffic or proof of an upstream quota**.

| Scenario | Previous engine RPC/s | Event candidate RPC/s | Reduction |
| --- | ---: | ---: | ---: |
| Two idle paddles in an active rally | 10.25 | 2.16 | 78.9% |
| Both players issuing 100 direction changes each | 9.62 | 5.03 | 47.7% |

Active-input snapshot reads fell from 202 to eight across the two players, a 96% reduction. Idle reads fell from 84 to two. Command counts stayed at 100 per player, with sequential input and SDK nonces. Initial raw reports are in [evidence/state-transport](./evidence/state-transport).

The PostgreSQL regression covers 20 duplicate queue/cancel cycles, eight-member capacity, a rejected ninth member, permission-provider failure and actual session expiry. An unrelated heartbeat and lobby read completed in 20 ms while acceptance evidence was delayed 1,800 ms. These are isolated service tests, not twenty complete production matches.

Browser recovery tests cover write/acknowledgement 429s, expired offers, a final-tick revert, a lost response, missed result observation during room rotation, same-tab session restoration and rejection of a second controlling tab. Both players' terminal state must be obtained from contract events or a full read; a missing reply never proves failure.

The final TypeScript suite passed 85 tests. The contract suite passed 164 tests. The unchanged Classic and Chaos mirrors each passed 10,000 differential cases. These correctness tests do not measure hosting latency.

## Real-node evidence and current blocker

At **2026-09-09 20:35:50 UTC**, a disposable friendly-match preflight received real `MatchAccepted`, `Snapshot` and `Completed` events with the `https://pongit.xyz` origin. Acceptance call latencies reported by the SDK were 181.87 ms and 116.21 ms; the closing concession was 60.73 ms. This proves actual stream delivery for those actions, not sustained match performance.

Later, the node stopped accepting writes. See [the transferable incident record](./INTERLUDE_PUBLICATION_INCIDENT_20260909.md). The full real two-arena Classic/Chaos comparison with spectators and the combined browser/server throughput measurement could not be completed. No result from the simulated benchmark should be described as that missing measurement.

The applied-event transport is prepared behind `ROOMS_STATE_STREAM_ENABLED`. Keep it disabled until the live acceptance, sustained input, pressure checkpoint and terminal/reconnect tests have passed after upstream recovery. The user requested another check approximately three hours after 21:29 UTC on September 9.

## Rollout and rollback

1. Preserve a private database/configuration backup and its verified offsite copy. Record the current web and relayer images.
2. Ship the compatible relayer and browser with `ROOMS_STATE_STREAM_ENABLED=false`. The new tables are additive. Keep `il_engine_jobs`, `relay_jobs`, `il_lifecycle_jobs`, `il_result_pending` and all finance bindings intact.
3. After node publication recovery, use disposable friendly rooms, never the public matchmaking queue, for the real test. `scripts/stream-live-browser.mjs` has an explicit testnet gate and refuses to start while an existing match is active. Its temporary recovery file contains test grants and must stay private.
4. Enable the flag, restart only the relayer when active games permit, refresh test tabs, and measure RPC windows of 1, 10 and 60 seconds with exact status/method and latency distributions. Verify results, reconnects and Chaos checkpoints before widening use.
5. To fall back, set the flag to `false` and restart the relayer. This keeps the recovery corrections and preserves all contract state, grants and journals. Refresh already-open tabs to pick up the flag. Do not reset any nonce or discard a pending result to make a deployment look healthy.

## Infrastructure maintenance

Backup `20260909T204619Z` was copied to the protected offsite location and verified. Obsolete PONGIT source archives, stopped test containers, unused PONGIT images and old build outputs were inventoried and removed. Production, rollback images, database volumes and other projects were preserved. Root filesystem usage fell from 92% to 79% before the final candidate build; build outputs are measured separately and cleaned after release.
