# PONGIT Arcade (GameV3)

Arcade adds two-hour gameplay authorizations, same-tab reload recovery, direct rematches, private invitation notifications and an original chiptune soundtrack. Classic/Chaos physics and financial rules remain unchanged. Monad Testnet only; daily sponsorship remains unlimited (`RELAYER_DAILY_BUDGET_MON=0`).

## Accounts and authorization

`web/lib/wallet.ts` remembers only the address, credential identifier and RP domain in localStorage. The wallet PRF derivation is unchanged. Continue selects that credential; Use another passkey performs discoverable selection; Forget removes the hint.

`web/lib/arcade.ts` stores the limited game key, signed grant and pending match consent/reveal data in sessionStorage. Wallet keys, notebook encryption keys and decrypted notes are excluded. The grant expires within two hours and is bound by EIP-712 to the registry, chain, player, key and GameV3. Registration requires signatures from both the wallet and game key, preventing another wallet from claiming somebody else's public input key. Renewal replaces the previous grant. Onchain revocation invalidates gameplay immediately; an offline logout clears local material and explicitly reports unconfirmed revocation.

GameV3 accepts a live arcade signer for bilateral match consent, restoring its own paddle authorization, revoking paddle control and conceding its own match. It enforces participant membership, rules, mode, ranked/friendly status, nonces and expiry. An arcade signer cannot delegate an unrelated input key. Vault, market, tournament payments and administration keep wallet-only authorization. Application authentication supports the registered game key for invitations and encrypted app data; it never grants a financial permission. A Web Lock permits only one controlling tab per account/deployment. Reload verifies the grant; expiration and revocation require explicit renewal and never trigger a surprise passkey dialog during play.

## Duels and audio

Rematch sends the previous opponent a 60-second invitation with source-derived rules. `POST /challenges/rematch` requires a versioned reference and verifies the caller participated in that finished match. Both players' signed joins still bind the exact opponent and rules. Tournament rematches use tournament ID zero and no entry fee. Other invitations last ten minutes and are friendly by default. Crossed/duplicate requests reuse the same active invitation. Accept automatically advances both players to consent, creation and reveal. Notifications require an authenticated WebSocket subscription; private events are sent only to the relevant accounts. Inbox polling and reconnect refresh provide recovery.

`web/lib/audio.ts` composes an original eight-bar minor-key chiptune loop, with separate effects for controls, invitations, matching, countdowns, impacts, points, handicap changes and results. A single AudioContext uses independent music/effects buses, voice limits and jingle ducking. The first entrance offers sound or mute (20% music, 60% effects). Preferences persist; subsequent visits resume after a permitted gesture. Scores/results use confirmed transitions. Reconnect snapshots do not replay a backlog of effects. Visibility changes suspend the audio scheduler and animations.

The background uses CSS perspective, transforms and opacity: cyan/violet grid, orbit outlines and moving particles around an opaque court. Background effects can be disabled; reduced-motion settings suppress animation. No realtime 3D engine is loaded.

## Contract deployment

Chain **10143**, index start block **60228868**. Deployment/binding receipts are in [the manifest](../deployments/testnet-v3.json).

| Contract | Address |
|---|---|
| GameV3 | `0x7b54521dfc6e8a4f310180fe2c232a4aab8582ad` |
| ArcadeSessions | `0xcbc74334ba69e7066535c2706ac686055f1ff426` |
| Vault | `0x405da4f0284b51a8a2b55ae93fbd7be7914d2e3e` |
| LMSR | `0x2a2e0abf17b0510f668aa1c03d7ea93333b98d8e` |
| Market | `0x61d0c59b376b482eb30b521bf696a54f33a4d567` |
| TournamentsV3 | `0x9ef9ee646786eabda1ea32b9b23f3c8b6dff0e01` |

V3 inherits both ELO ratings from V2. V1/V2 manifests remain recursively embedded and their balances, claims, withdrawals and replay references remain separate. A single relayer signing journal retains all previous raw transactions/nonces. Envio indexes all three generations into a new database; prior databases remain intact. The immutable treasury still requires redeployment to replace it.

## Automated validation

- [64 Solidity tests and 11 TypeScript tests](evidence/arcade/contracts-and-unit.txt), including invalid/replayed grants, key possession, expiry/revocation, multiple delegated matches and rejected owner-fund withdrawal.
- [10,000 differential cases per mode](evidence/arcade/differential.txt), zero mismatches.
- [Production-build browser flow on isolated Anvil](evidence/arcade/browser-local.json): direct duel, two-player rematch, spectator, F5 with no new PRF assertion, another controlling tab rejected, separate finance assertion, logout revocation and remembered reconnect.
- [Chaos and private notebook](evidence/arcade/chaos-local.json): bet-driven handicap, confirmed result, independent friendly ELO, encrypted save/recovery, timestamped replay notes and mobile layout.
- [Crash recovery V1 → V2 → V3](evidence/arcade/recovery.json): identical pending signed bytes/nonce after migration, one credit per generation and sequential subsequent nonce. [Four-player tournament](evidence/arcade/tournament-local.txt): three matches, two rounds and exact prize payout.
- [Chrome](evidence/arcade/audio-chromium.json), [Firefox](evidence/arcade/audio-firefox.json), [WebKit](evidence/arcade/audio-webkit.json): activation, mute, volume persistence, visibility lifecycle and reduced motion. Firefox/WebKit ran in Linux; Firefox used a PulseAudio null output. This verifies the audio graph and scheduling, not physical speaker quality or Safari/iOS hardware.
- Both npm audits report zero known vulnerabilities at validation time. [Publication audit](evidence/arcade/publication-audit.json): no secret findings in Git history or the staged publication tree; configuration placeholders and the public Anvil fixture were reviewed separately.

Physical cross-device passkey synchronization and physical Safari/mobile speaker testing remain distinct device checks. Interlude is not integrated. Its browser demonstration reports about 30 ms; 50–150 ms remains a provisional PONGIT live-response target, dependent on the operator and network, not a measured guarantee or Monad settlement time. See [Interlude](https://interludelayer.xyz/) and [live versus settled reads](https://interludelayer.xyz/docs/read).

## Production validation

Arcade/V3 opened on **https://pongit.xyz on September 6, 2026**, after V2 matches finished, a backup and the V3 indexer backfill. V1/V2 financial balances remain in their original vaults. The following evidence comes from the actual HTTPS site and Monad Testnet, not a local simulation:

| Check | Evidence and scope |
|---|---|
| Deployment | [Registry, immutable bindings, bytecode and deployment receipts](evidence/arcade/deployment-verification.json). GameV3 runtime is 23,806 bytes, below the 24,576-byte limit. |
| Accounts and direct duels | [Two players and a spectator](evidence/arcade/https-arcade.json): rematch, F5 without a fresh PRF assertion, one controlling tab, finance requiring a separate assertion, a 17-second network outage, revocation and remembered reconnect. The Accept response is deliberately delayed behind the private notification to exercise duplicate delivery. |
| Matchmaking and funds | [Ranked matchmaking, signed cancellation, touch input, bets, claim, withdrawal and replay](evidence/arcade/https-matchmaking.json). [Browser run log](evidence/arcade/https-browser-tests.txt). |
| Chaos and notebook | [Paid-bet handicap down to a 72-unit paddle, encrypted notebook recovery, private replay notes and exact payouts](evidence/arcade/https-chaos.json). [Ranked Chaos changes only Chaos ELO](evidence/arcade/https-ranked-chaos.json). |
| Tournament | [Four players, three matches and a 0.01 test-MON prize](evidence/arcade/https-tournament.json). The final ended naturally at **7:6**; the earlier rounds used concession. |
| Confirmed replay | [The natural final](evidence/arcade/https-replay.json): 19 Envio snapshots match contract state, 18 reconstructed transitions and the final state match the chain. |
| Administration | [Mera-authenticated game/market pauses, tournament creation/cancellation and temporary role cleanup](evidence/arcade/https-admin.json). |
| Legacy money | [V1 and V2 deposits/withdrawals through the V3 service](evidence/arcade/legacy-finance.json): each test withdrew only its new deposit and preserved the pre-existing balance. Earlier positive claims remain documented in the V2 delivery; already-claimed bets were not claimed again. |
| Audio | The Chrome, Firefox and WebKit reports linked above use HTTPS. They validate activation, routing, mute, remembered levels and visibility behavior; physical speakers and Safari/iOS devices were not tested. |
| Mobile | [Chrome emulation](evidence/arcade/mobile-https.json), 390 × 844 with CPU/network throttling: LCP 1,072 ms, CLS 0.0915, frame-gap p95 12.1 ms and p99 30.3 ms. This is not a physical-phone benchmark. Layout also checked at 320/360/390/430 pixels. Account dialogs scroll in short viewports. |

### Measured latency and cost

[The transaction journal sample](evidence/arcade/production-transactions.json) contains **283 sponsored transactions**, including **80 successful movement commands**. From relayer enqueue to observed receipt, movement latency was **791 ms p50 / 1,357 ms p95 / 1,617 ms p99**. Component medians were 277 ms queued, 115 ms for broadcast and 353 ms awaiting confirmation; component quantiles cannot be added to obtain an overall quantile.

[A separate browser sample](evidence/arcade/https-input-latency.json) measured **19 commands** from POST start to the first successful WebSocket receipt: **822 ms p50 / 1,658 ms p95 / 1,658 ms p99**. This includes delivery back to the browser. Neither measurement describes the local predicted frame response.

Observed throughput was **0.125 sponsored transactions/second across a mixed functional-test window with idle time**, not a capacity or saturation benchmark. The natural 7:6 tournament final (`v3:11`) used **22 sponsored game transitions costing 0.2843079 test MON**, including creation, reveals, resolution and rating. There were no paddle-input transactions in that final. Market operations, faucet credits, payouts and direct callers are excluded from this match figure; per-transition receipts and fees are in the journal report. Fees use transaction gas limit × effective gas price, consistent with [Monad gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing).

### Persistence and recovery

The backup at **20260906T171212Z** was restored into six temporary databases: the relayer journal and all five retained indexer databases. Every table count matched its source, then the temporary databases were removed. The backup was also copied over SSH to the operator's protected off-VPS storage and its checksums verified. [Restore evidence](evidence/arcade/backup-restore.txt).

The V3 indexer retained all **365 legacy replay frames**, with an identical sorted-state digest before and after cutover. [Operational verification](evidence/arcade/operations.json) records restart, journal and rollback checks: all seven services recovered, a V2 application was rejected, and a real V3 rollback/return preserved all 747 journal entries and 719 unique signed nonces. [Browser restart recovery](evidence/arcade/reboot-session.json) records same-tab F5 recovery without another passkey assertion after an actual VPS reboot (40.7 seconds of observed interruption), followed by successful onchain revocation.

Remaining device checks are physical cross-device passkey synchronization and Safari/iOS audio/touch behavior. A maximum-load capacity test and an independent security audit have not been performed. The reported browser identities use Chromium virtual PRF authenticators with the real Mera SDK; this does not prove passkey synchronization between physical devices.

## Operations and Git

Use `ops/rollback-v3.sh COMMIT` only with a release containing identical V3/legacy manifests. It rejects V1/V2 application binaries and changes to immutable contracts. Backups enumerate every PONGIT indexer generation and retain the original relayer journal. The existing offsite SSH copy and seven-day retention remain in place. See [operations](DEPLOYMENT.md).

All twelve historical project commits were rewritten from T450 to DEUSVULTXYZ for both author and committer, preserving trees, timestamps and messages. The original bundle and old/new SHA mapping are private operator artifacts outside this repository. Publication uses explicit force-with-lease checks on main and codex/pongit-v2. GitHub caches and third-party clones may retain the old metadata.
