# Neon Rush release validation

Production: **https://pongit.xyz**. Tested application code: `e77ec833c5a41c30f7794dae544ede497007211b`. Monad Testnet 10143, unchanged V4 contracts. [Machine-readable evidence](validation/neon-rush.json) includes the benchmark transaction hashes, payment proofs and verification results.

## Delivered behavior

- Releases and direction changes reach the server without waiting for the previous receipt. One immutable submitted input and the latest pending intention are retained per player; replaced intentions do not consume nonces.
- The paddle preview is reconstructed, bounded and reconciled with confirmed state. The normal view has one paddle; diagnostic details expose the server and chain delays.
- Neon Rush scenery, a compact arena, four-second skippable result sequences, the supplied soundtrack, stronger effects, a sound test and truthful audio status are live. Motion and background controls remain available.
- Each player retains their latest three played, finished replays across all deployments. Shared replays remain while either participant retains them. Results and financial records survive replay retirement.
- Local PONGIT services and data volumes were backed up, restored for verification, then removed. Onveil's four services remain healthy. Future service tests run in the private, disposable VPS sandbox.

## Measured input delays

Real signed inputs through the browser controller, from the test computer to production. Values are milliseconds; total includes relayer receipt observation, not just chain inclusion.

| Stage | One arena p50 / p95 / p99 | Four arenas p50 / p95 / p99 |
| --- | --- | --- |
| HTTP acknowledgement | 93 / 294 / 411 | 223 / 472 / 721 |
| Relayer queue and signing | 156 / 454 / 1017 | 226 / 2128 / 2873 |
| Broadcast response | 176 / 240 / 306 | 180 / 285 / 293 |
| Receipt observation | 348 / 543 / 722 | 404 / 677 / 794 |
| Confirmed total | 741 / 1148 / 1187 | 910 / 2765 / 3302 |

The one-arena phase accepted **141 unique jobs**: 42 confirmed and 99 superseded. Four arenas accepted **327**: 44 confirmed and 283 superseded. Both phases ended with zero failed/pending jobs, duplicate executed transaction hashes or nonce gaps. Superseded directions were intentionally replaced before signing; they are not onchain throughput. The raw evidence separates retries from unique jobs.

The earlier V4 observation had a queue p95 of 794 ms and confirmed total p95 of 1229 ms (32 samples). The new one-arena values are 454 ms and 1148 ms. These workloads differ, so this is an operational comparison, not a controlled A/B experiment. The remaining four-arena tail is material. Moving only the frontend to Vercel would leave the current relayer and chain path in place. Interlude is not enabled.

## Verification

- **77 Solidity tests**, **22 TypeScript tests**, typechecks, and **20,000 differential physics cases** passed.
- Real PostgreSQL input tests covered signatures, expiry, revocation, sequential nonces, coalescing and immutable submitted bytes. Crash recovery re-broadcast the same persisted transaction and credited once across the V1-V4 journal.
- HTTPS browser tests passed for direct duels, rematches, F5 without another passkey, cloned tabs, offline recovery, explicit financial signatures, disconnect/revocation, profiles, the encrypted notebook, Chaos handicap, spectators, replay and administration.
- Two winning bettors received exactly **0.003 / 0.005 MON**, including an offline beneficiary, without a receiving signature. A losing position received zero and displayed no claim button. A concurrent match continued accepting inputs.
- A four-player tournament completed both rounds and paid the exact **0.01 MON** prize. Its final ended naturally **7-6**. Separate signed V1, V2 and V3 withdrawals each credited exactly **0.001 MON**, preserving prior balances.
- Chrome and Edge produced measurable music and effects at the output analyser; mute, user activation, volumes, hidden-tab suspension and recovery passed. Physical speaker/headphone listening remains separate.
- At 390x844, DPR 3, fourfold CPU slowdown and simulated 4 Mbps networking, the replay sample averaged **68 FPS**, with a **36 ms p95 frame gap**, **0 CLS**, and **4.2 s LCP**. This is Chromium emulation, not a physical phone. Desktop 720px arena visibility and reduced-motion/no-effects layouts passed.

## Data and operations

The migration independently reindexed all four generations. All common match fields and financial/competition entities matched exactly before cutover. Replay frames went from 750 to 664; `v1:9` and `v2:5` were retired. Later browser tests added matches normally; retention still held at three per player. Retired replay API requests return **410**, while their summaries and financial rights remain accessible.

Backup `20260906T223152Z` restored all **nine databases**, with every table count matching. PostgreSQL, RPC gateways, indexer, Hasura, relayer, web and Caddy restarted successfully. The journal through nonce **1394** retained the same fingerprint; **15 paid tasks / 0.058 MON** remained unchanged, with no duplicate nonces. The compatible rollback to `2f40574eee7289aa737388e5683a497aa1fb081c` and return to Neon Rush both passed, including the replay-retention API. The protected offsite copy is verified separately from Git.

The transaction journal measured **4.52 MB** at validation; replay retention does not cap this journal or accounting growth. Backups retain seven days. VPS cleanup reduced disk usage from about **37 to 23 GiB**, preserving production and compatible rollback images. The local PostgreSQL backup restored all **18 databases** before PONGIT-only deletion.

Use [the operations procedure](NEON_RUSH.md) for deployment and rollback. No contract, wallet derivation, financial rule or daily sponsorship ceiling changed. Physical cross-device passkey recovery remains a separate device demonstration. No claim of instant confirmation or flawless performance under arbitrary load is made.

The offsite task also passed under its actual Windows PowerShell 5.1 runtime (scheduled task exit code 0) after correcting SSH argument quoting. Publication checks found no operator secrets or credential patterns; Gitleaks scanned 36 commits without findings. The dependency audit reported zero vulnerabilities. Unrelated user submission drafts were excluded.
