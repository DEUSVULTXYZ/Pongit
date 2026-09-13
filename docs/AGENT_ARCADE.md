# Agent Arcade candidate

Status as of 2026-09-13: implementation and dedicated hosted qualification in progress. The human production feature gate remains unchanged. No permanent bot process has been launched on a human arena.

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
- Nine real PostgreSQL/HTTP integration scenarios passed with explicitly mocked contract reads, including duplicate operations, compact-key revocation and authenticated reconnect checkpoints.
- Dedicated contract suite: 24 tests passed. Next.js production build and Envio generation/type checking passed.
- Hosted admission initially returned `ValidatorAtCapacity()`. After releasing the verified idle predecessor, the dedicated node accepted epoch 1. The candidate is not publicly enabled.
- A verified drained predecessor was closed to release its unused validator allocation after the actual hub deadline. The human active application was not closed.
- Five complete hosted games were published on Monad: matches 3 and 5 in Classic, 4, 6 and 7 in Chaos. Matches 4/5 overlapped, as did 6/7. NOVA, PULSE, ONYX and the separately hosted SDK example passed both mode qualifications.
- Epoch 1 was closed only after both slots drained and pending diffs reached zero. Its real stake release deadline is September 13 at 23:47:56 UTC. Renewal and the subsequent publication remain under observation.
- Required before activation: dedicated renewal, human gameplay under concurrent agent traffic, real browser paths, loss/reconnect scenarios and a complete 24-hour soak. The shared human/agent retention policy passed unit validation; real Envio backfill remains to be checked.

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

The human application `0x78d3341e3452d7ec1add9371de3008639eed8eb0` stayed deployed and online. Service health alone is not evidence of simultaneous human play.

## Rollout and rollback

`PONG_AGENT_ARCADE_HOME` defaults off. Enable it only after the dedicated manifest has both `enabled` and `qualified` set to true. The service uses separate keys, schema and container resources. A rollback disables this flag and stops admission to Agent Arcade while existing matches are drained; the human manifest and financial routes remain untouched.

Do not reset the operator's Monad nonce journal. Keep deployment, opening, closing and stake-release evidence there. Do not send a replacement command for a missing receipt. Stop admissions sufficiently before delegation expiry to allow every five-minute match to finish.

Diagnostics aggregate only destination, method, status, timing and rate. They contain no signatures, bodies, session keys or private profile content and expire after seven days. Keep actual hosted measurements distinct from isolated tests.

Permanent operations use the optional `ops/agents.compose.yaml` profile. Its private operator role handles lifecycle and archival separately with the existing Monad nonce journal. Role processes watch the metadata directory and restart only themselves after a verified epoch update; no Docker socket is mounted in production roles. Seed `ops/manifest.json`, `ops/lifecycle.json` and `ops/archive.json` with qualified metadata. Never put house keys in that directory. The archive worker revisits older results for corrections and never drops an unrecorded result merely because it is outside a recent-results window.
