# PONGIT Arcade — onchain rivals, neon and chiptunes

**[Play PONGIT](https://pongit.xyz)** · [Documentation](https://pongit.xyz/docs) · [Automatic wallet payments](docs/PAYMENTS_V4.md) · [Arcade release](docs/ARCADE.md) · [Architecture](docs/V2.md) · [Local setup](docs/LOCAL.md)

A browser-based 1v1 arcade game whose physics, scores, results and ELO are computed in Solidity on **Monad Testnet (10143)**. The Next.js canvas predicts rendering, Mera provides passkey accounts, the relayer sponsors gas and Envio reconstructs match history. No browser wallet extension is required. All bets and prizes use test MON.

## Play, challenge and compete

- **Classic and Chaos**, with separate ranked queues and ELO. Friendly challenges leave both ratings unchanged.
- **Two-hour arcade sessions** survive F5 in the same tab. Remembered passkeys keep gameplay flowing; finance still asks for the wallet passkey.
- **One-click rematches** and **direct challenges** from a profile, ladder, address or shareable link; signed consent from both players, invitation inbox and blocking.
- **Chaos betting pressure**: accepted spectator bets can shrink the favourite's paddle for the next rally, with a visible intermission and a maximum 25% reduction.
- **Optional public profiles** and a separate **private Mera notebook** for rivals, replay notes and preferences. The notebook uses its own passkey PRF namespace and AES-GCM encryption.
- **Spectating, Envio replays, LMSR markets, automatic wallet payouts, signed withdrawals, Classic tournaments and role-based administration**.
- Michroma, precomputed neon artwork, keyboard/touch controls and skippable **VICTORY / DEFEAT** animations. A compact cabinet home leads straight into play. Enter with **Last Stop** — Music by **Karl Casey @ White Bat Audio** — or muted. Music/effect volumes and static room appearance are remembered; reduced-motion preferences are respected.

The site runs on a VPS with Docker Compose, private PostgreSQL and automatic Let's Encrypt certificates. V1/V2/V3 replays, claims, withdrawals and balances remain separately accessible from Archive.

## Build and verify

Requirements: Node.js 24+, npm, Git, Foundry (`forge` and `anvil`) and Docker Compose. Envio runs in Linux containers, including on Windows. Both npm lockfiles pin JavaScript dependencies; bootstrap installs a pinned forge-std commit.

```sh
npm ci
npm run bootstrap
npm run contracts:build
npm run abi
npm run abi:v2
npm run abi:v3
npm run abi:v4
npm run typecheck
npm test
npm run test:differential
npm run test:differential:v2
```

See [local setup](docs/LOCAL.md) for the complete development stack and [operations](docs/DEPLOYMENT.md) for deployment, backups, restoration and rollback. GitHub CI is manually triggered.

## What determines the result

| Component | Responsibility |
|---|---|
| `contracts/src/v2/PhysicsV2.sol`, `shared/physics-v2.ts` | Integer event physics and matching bigint implementation; 1024 × 576 court, first to seven. |
| `contracts/src/v3/GameV3.sol`, `contracts/src/v3/ArcadeSessions.sol` | Signed consent, commit/reveal, EIP-712 sessions, block clock, frozen rules, separate ratings and results. |
| `contracts/src/Vault.sol`, `contracts/src/v4/MarketV4.sol` | Owner-authorized finance, sealed modules, funded LMSR, reserve checks, settlement and refunds. |
| `contracts/src/v4/TournamentsV4.sol` | ELO seeding, 2–32 player single-elimination brackets and test MON prizes. |
| `relayer/src/main.ts` | Simulation, quotas, persistent signed transaction journal, matchmaking and WebSocket updates. |
| `web/lib/wallet.ts`, `web/lib/notebook.ts` | Mera wallet/session lifecycle and independent private notebook encryption. |
| `indexer/src/handlers.ts` | Envio handlers for all four deployments, ladders, replays and concentration signals. |

## Evidence and limits

The [Arcade delivery report](docs/ARCADE.md) records V3 addresses, **64 passing Solidity tests**, **11 passing TypeScript tests**, **20,000 differential physics comparisons**, HTTPS multiplayer flows, recovery, backups and actual Monad latency/cost measurements. The [V2 delivery report](docs/V2_DELIVERY.md) remains available as a historical record. [Bounty evidence](docs/QUESTS_V2.md) and [three logo directions](docs/BRAND_V2.md) are included.

The repository is public at the owner's request. The daily sponsorship ceiling is disabled (`RELAYER_DAILY_BUDGET_MON=0`); balance reservations, gas-price limits, abuse quotas and solvency checks remain active. Credentials and deployment secrets are excluded from Git.

Chain inclusion delay remains visible. Prediction does not make an unconfirmed input authoritative, and betting locks reduce latency advantage without eliminating it. Interlude has a documented transport boundary but is **not integrated**. Physical cross-device passkey recovery still needs a demonstration. This is a testnet release without an external security audit or a claim of bug-free operation.

See [Night Shift UX](docs/NIGHT_SHIFT.md) for the cabinet navigation, recent-match API and audio credits.
