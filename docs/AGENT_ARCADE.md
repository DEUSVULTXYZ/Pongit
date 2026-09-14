# Agent Arcade candidate

Status as of 2026-09-14: implementation and dedicated hosted qualification in progress. The human production feature gate remains unchanged. No bot process has been launched on a human arena.

## Contract candidate

- Monad Testnet: 10143; execution chain: 4242; rules: 7.
- Application: `0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9`.
- Deployment transaction: `0xb85159833ba9cc26cee8f2b9a33250c7b9fe0ae4022b4a0cfa2b500d2c785b6c`.
- AgentIdentity library: `0xccaebf3146e4f17d8ca1967d5cdd9334823e62ce`.
- Separate coordinator key, house addresses and business database. Private key files are excluded from the repository.
- Reuses immutable physical modules; no market or vault is deployed. Financial pressure submissions always revert.

## Qualification gates

- Agent-specific contract tests pass, including the 24 effects, all 276 pairs, five-minute leader/draw handling, the seventh point, creator restrictions and human ELO isolation.
- Full contract regression: 365 passed, zero failed, two real-hub fork tests skipped because no fork configuration was supplied. Additional agent isolation tests are tracked separately.
- TypeScript regression: 207 passed, zero failed. Differential physics: 10,000 Classic cases and 10,000 current Chaos-event cases matched exactly; the older realtime Chaos mirror also passed 10,000 comparisons.
- Chrome and Edge: catalogue, connection dialog, live canvas and spectator result checked at 360, 390, 768 and 1440 pixels against a captured private production build with simulated APIs. These are not hosted multiplayer proofs.
- Ten real PostgreSQL/HTTP integration scenarios passed with explicitly mocked contract reads, including duplicate operations, compact-key revocation, authenticated reconnect checkpoints and reserving the next duel after an engine result but before its publication.
- Dedicated contract suite: 24 tests passed. Next.js production build and Envio generation/type checking passed.
- Hosted admission initially returned `ValidatorAtCapacity()`. After releasing the verified idle predecessor, the dedicated node accepted epoch 1. The candidate is not publicly enabled.
- A verified drained predecessor was closed to release its unused validator allocation after the actual hub deadline. The human active application was not closed.
- Five complete hosted games were published on Monad: matches 3 and 5 in Classic, 4, 6 and 7 in Chaos. Matches 4/5 overlapped, as did 6/7. NOVA, PULSE, ONYX and the separately hosted SDK example passed both mode qualifications.
- Epoch 1 was closed only after both slots drained and pending diffs reached zero. It was released at block 62316540, and epoch 2 opened at block 62316763. The services resumed on the verified epoch, and human-agent match 11 completed 2 : 7 and was published at block 62317408. This completed the hosted renewal cycle.
- A stable 24-hour soak started on September 14 at 00:17:57 UTC and is scheduled to end on September 15 at 00:17:57 UTC. Earlier short trials were deliberately stopped during fixes and retained as incomplete reports. Source hashes, sample gaps, availability and storage deltas are recorded; elapsed time alone does not open the service.
- Real HTTPS-origin browser qualification passed human-agent Classic (3 : 7) and Chaos (4 : 7), with matching spectator results, F5, a response lost after actual execution and an injected 429 before submission. One virtual Mera credential creation was recorded, with no further credential ceremony between games. This is not physical passkey recovery evidence.
- Concurrent public human games passed Classic (7 : 5) and Chaos (5 : 7), each with two players, a spectator and F5. They used the existing human application while the dedicated agents ran separately.
- Required before activation: a complete 24-hour soak and review of real shared-indexer backfill. The private indexer rebuild starts at the unchanged production history boundary, block 62260200; it does not reset the human database.

## Hosted evidence

| Match | Mode | Score | Published Monad block |
| --- | --- | --- | --- |
| 3 | Classic | 7 : 4 | 62303254 |
| 4 | Chaos | 5 : 7 | 62303830 |
| 5 | Classic | 6 : 7 | 62303988 |
| 6 | Chaos | 3 : 7 | 62304344 |
| 7 | Chaos | 7 : 2 | 62304375 |

All references use chain 10143, application `0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9`, epoch 1. The result-discovery archive is `0x75656a40cd474ced383460ff0113022e9338a5ff`, deployed at block 62304867. It has no fund custody or payout entry point.

Opening transaction: `0xcab1f6eb97a22831f343d9996dbb7f288edd0f07b14a2ba36a5b09080fd7eb99`. Closing transaction: `0x35cbd78d10088759818a2ad7b9ef184f7e79ec5daa6163098e85099711497ab1`. These prove one hosted epoch, not an uninterrupted 24-hour service.

Release transaction: `0xe7447b2d73c63788b745fcc380d7cb93b217e986b1adef8d20db0f0725cf9199`. Epoch 2 opening: `0x0d2987c02e3441c2bac25f9e88809f95cfc71cb9b9ba658b1f6b25f364b3c30c`. The hosted node returned the expected application, epoch, rules and active health before admissions resumed.

The human application `0x78d3341e3452d7ec1add9371de3008639eed8eb0` stayed deployed and online. Separate real-browser reports record the simultaneous human tests; service health samples alone are not used as proof of gameplay.

## Browser measurements and corrected defects

The private routed browser used the real hosted engine. Among 216 actual `interlude_sendTransaction` responses, RPC response time was p50 105 ms, p95 174 ms and p99 194 ms. Sixty-two `eth_call` responses measured p50 99 ms, p95 167 ms and p99 207 ms. The injected 429 was not forwarded and is excluded from the network count. These are VPS-browser RPC timings, not display latency or a measured before/after improvement.

The concurrent human-browser run recorded 483 game submissions with p50 195.8 ms, p95 379.3 ms and p99 447.9 ms. Locations, traffic and game paths differ, so this is not a benchmark comparing the contracts.

Real-browser validation exposed and fixed a rejected next-duel reservation while the previous result was being published, restoration of a dismissed result during inbox polling, and a canvas retaining its default width. The old participation lock remains until publication; reserving a future duel cannot start a second simultaneous match for that player. Duplicate operations return the original reservation. Shutdown is idempotent, including repeated close calls.

Chrome and Edge captured-build checks were repeated after the canvas fix. Both modes fill the available cabinet at 360, 390, 768 and 1440 pixels, preserve 16:9 and do not shift when a Chaos effect changes. Simulated rendering checks and hosted tests are recorded separately.

## Rollout and rollback

`PONG_AGENT_ARCADE_HOME` defaults off. Enable it only after the dedicated manifest has both `enabled` and `qualified` set to true. The service uses separate keys, schema and container resources. A rollback disables this flag and stops admission to Agent Arcade while existing matches are drained; the human manifest and financial routes remain untouched.

Do not reset the operator's Monad nonce journal. Keep deployment, opening, closing and stake-release evidence there. Do not send a replacement command for a missing receipt. Stop admissions sufficiently before delegation expiry to allow every five-minute match to finish.

Diagnostics aggregate only destination, method, status, timing and rate. They contain no signatures, bodies, session keys or private profile content and expire after seven days. Keep actual hosted measurements distinct from isolated tests.

Permanent operations use the optional `ops/agents.compose.yaml` profile. Its private operator role handles lifecycle and archival separately with the existing Monad nonce journal. Role processes watch the metadata directory and restart only themselves after a verified epoch update; no Docker socket is mounted in production roles. Seed `ops/manifest.json`, `ops/lifecycle.json` and `ops/archive.json` with qualified metadata. Never put house keys in that directory. The archive worker revisits older results for corrections and never drops an unrecorded result merely because it is outside a recent-results window.
