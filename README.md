# PONGIT Arcade: onchain rivals, neon and chiptunes

**[Play PONGIT](https://pongit.xyz)** · [Documentation](https://pongit.xyz/docs) · [Automatic wallet payments](docs/PAYMENTS_V4.md) · [Arcade release](docs/ARCADE.md) · [Architecture](docs/V2.md) · [Local setup](docs/LOCAL.md)

**9 September testnet preview:** Classic and Chaos rooms are enabled on the Fly.io deployment at the owner's request. The hosted RPC still returns HTTP 429 under sustained reads, which can pause gameplay. This is a public trial, not a completed multiplayer/load validation. New-app payout and renewal checks remain incomplete; published results still wait for delegation finality before payment. See the [release record](docs/CHAOS_FLY_PREVIEW.md). V4 balances, markets and tournaments remain available separately.

A browser-based 1v1 arcade game with Solidity-authoritative physics, scores, results and ELO. The main rooms use a hosted Interlude engine and publish state to **Monad Testnet (10143)**. Markets, vaults and payouts execute on Monad; the separate V4 arcade also runs its gameplay there. The Next.js canvas renders movement, Mera provides passkey accounts, the relayer sponsors gas and Envio reconstructs V1 to V4 history. No browser wallet extension is required. All bets and prizes use test MON.

## Play, challenge and compete

- **Classic and Chaos**, with separate ranked queues and ELO. Friendly challenges leave both ratings unchanged.
- **Thirty-minute rooms sessions** survive F5 in the same tab; the V4 arcade retains its two-hour sessions. Remembered passkeys keep gameplay flowing; finance still asks for the wallet passkey.
- **One-click rematches** and **direct challenges** from a profile, ladder, address or shareable link; signed consent from both players, invitation inbox and blocking.
- **Chaos betting pressure**: accepted spectator bets can shrink the favourite's paddle for the next rally, with a visible intermission and a maximum 25% reduction.
- **Optional public profiles** and a separate **private Mera notebook** in the V4 arcade for rivals, replay notes and preferences. The notebook uses its own passkey PRF namespace and AES-GCM encryption.
- **Spectating, Envio replays, LMSR markets, automatic wallet payouts, signed withdrawals, Classic tournaments and role-based administration**.
- Michroma, precomputed neon artwork, keyboard/touch controls and skippable **VICTORY / DEFEAT** animations. A compact cabinet home leads straight into play. Enter with **Last Stop** (music by **Karl Casey @ White Bat Audio**) or muted. Music/effect volumes and static room appearance are remembered; reduced-motion preferences are respected.

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

Prediction does not make an unconfirmed input authoritative, and betting locks reduce latency advantage without eliminating it. [Rooms](docs/CHAOS_ROOMS.md) use a hosted engine and scoped Mera sessions; financial operations and the preserved V4 arcade execute on Monad. Chaos intermissions include a 40-block betting window. Payout finalization waits for delegation closure and its challenge period; scheduled renewal temporarily pauses new games. The [earlier Classic lab](docs/INTERLUDE_LAB.md) remains documented separately. Physical cross-device passkey recovery still needs a demonstration. This is a testnet release without an external security audit or a claim of bug-free operation.

See [Night Shift UX](docs/NIGHT_SHIFT.md) for the cabinet navigation, recent-match API and audio credits.

The [contract-authority candidate](docs/CONTRACT_AUTHORITY.md) prepares contract-owned matchmaking, rooms, profiles, encrypted backups and a Monad recovery path. It is not deployed or connected to the production interface. [Qualification evidence and remaining gates](docs/AUTHORITY_QUALIFICATION.md) distinguish isolated tests from the hosted Chaos proof and recovery validation still required before migration.
