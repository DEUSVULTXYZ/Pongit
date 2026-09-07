# PONGIT V2 delivery: September 6, 2026

Historical V2 delivery record. The current deployment is [PONGIT Arcade / GameV3](ARCADE.md); V1/V2 funds and replays remain accessible separately.

Live site: **https://pongit.xyz**. Monad Testnet, chain **10143**. Repository: **[DEUSVULTXYZ/Pongit](https://github.com/DEUSVULTXYZ/Pongit)**, kept **public at the owner's request**. `/opt/pongit/current/RELEASE` identifies the application commit deployed on the VPS.

## Available functionality

- Classic and Chaos, separate ELO, friendly/ranked direct challenges, open/addressed links, signed consent, inbox and blocking.
- Optional public profiles, preset avatars, full account address and disconnect; Michroma neon identity with Opposing Orbits, two alternative logo directions and favicon.
- Chaos paddle reduction applied only after the rally break, based on MON actually paid: 0.002 MON threshold, favourite above 60%, minimum height 72 units.
- Confirmed-result VICTORY/DEFEAT animations, immediate skip, muted-by-default sound and reduced-motion support.
- Mera AES-GCM notebook separate from the wallet: rivals, private timestamped replay notes and applicable preferences. Encrypted saves report revision conflicts explicitly.
- Spectators, Envio replays, LMSR betting, claims, withdrawals, Classic tournaments and onchain administration.
- V1 Archive with separate balances, claims and withdrawals. No automatic fund transfer.

The daily sponsorship ceiling is **disabled at the owner's request** (`RELAYER_DAILY_BUDGET_MON=0`). Available balance, signed commitments, gas-price limits and abuse quotas remain enforced.

## V2 contracts

| Contract | Monad Testnet address |
|---|---|
| GameV2 | `0x47dba35e83e6488bb558bb8cdd95ec729d26770d` |
| Vault | `0x925bd397e02391557fd7e99028bea09f24bb5002` |
| MarketV2 | `0x8ab2502ddb70751c6c94155d9c71eeacf58abd04` |
| LMSRV2 | `0x8f14047ec37e0b7214e160b1392130ef9589c2f3` |
| TournamentsV2 | `0x11d61844e32352f4f7676915035ac20c015bbfd3` |
| EloFormulaV2 | `0x24638D226524dde3e773831042FBdaD70CB87de9` |

V2 indexing starts at block **60194717**. Deployment, binding and sealing receipts are in the [manifest](../deployments/testnet-v2.json). V1 Game remains `0xb66d62f0eabc5f1f86faca76bebc8353c2fbe0dd` with its own financial contracts. New V1 gameplay/markets are paused; legacy claims and withdrawals remain available.

## Completed validation

- **49 passing Solidity tests**, including V1/V2 solvency invariants, signatures, nonces, expiry, revocation, Chaos heights, intermissions and ELO finalization.
- **11 passing TypeScript tests**, covering encryption/integrity, Mera recovery, presentation, reserve accounting and RPC priority/fallback. Type checking and production Next.js compilation pass.
- **10,000 physics comparisons per mode**, zero differences: [differential evidence](evidence/v2/differential.json).
- Social API on an isolated local chain: replayed authentication rejected, unique handles, notebook conflicts, expected account checks, blocking, addressed links, concurrent acceptance and expired invitations.
- HTTPS with the real Mera SDK and virtual Chromium PRF authenticators: [Classic](evidence/v2/https-classic.json), [friendly Chaos and notebook](evidence/v2/https-chaos.json), [administration](evidence/v2/https-admin.json).
- [Four-player tournament](evidence/v2/https-tournament.json), three matches, two rounds and exact prize payout; [ranked Chaos challenge](evidence/v2/https-ranked-chaos.json), Chaos ELO changed while Classic ELO stayed unchanged.
- [Winning V1 bet](evidence/v2/legacy-finance.json), positive 0.001 MON claim and exact withdrawal through the V2 relayer.
- [Crash before inclusion](evidence/v2/relayer-recovery.json): V1 journal resumed by V2, identical signed bytes/nonce, one credit, then a V2 transaction at the next nonce.
- [Actual VPS reboot](evidence/v2/vps-reboot.txt), automatic service restart and identical fingerprint of **356 signed transactions with 356 distinct nonces** before/after.

Validation matches may end through signed concession. These tests exercise flows and settlement, not human competitive play. Public demonstration transactions remain visible in match histories.

The final publication build passed both HTTPS flows again after the dependency fixes: [Classic](evidence/v2/https-classic-publication.json), [Chaos/notebook](evidence/v2/https-chaos-publication.json) and [test log](evidence/v2/https-publication-tests.txt). The patched Envio indexer resumed its existing database and served the new replays.

## Measured latency and cost

The first post-cutover measurement includes **128 actual transactions** during tests and concurrent play: [receipts and transition details](evidence/v2/production-transactions.json).

| Measurement across 32 confirmed game inputs | p50 | p95 | p99 |
|---|---:|---:|---:|
| Relayer receipt of request to recorded confirmation | 816 ms | 1,468 ms | 1,682 ms |
| Waiting before signing | 261 ms | 700 ms | 915 ms |
| Submission to recorded confirmation | 356 ms | 773 ms | 921 ms |

Observed throughput was **0.264 transactions/s over 484.6 seconds**, including player waits and different operation types. This is not a maximum-capacity benchmark. Game-only transition fees were **0.3259035 MON** for V2:1 (22 transactions) and **0.1360633 MON** for V2:2 (8 transactions). These exclude distributed credits, liquidity, bets and direct calls by other accounts. Per-transition fees and failed transactions are recorded in the report.

This baseline precedes the final value-transfer waiting-window correction. A sufficiently funded relayer no longer waits unnecessarily between credits and liquidity deposits, while reserve checks remain. The final [browser sample](evidence/v2/input-latency-publication.json) after dependency updates recorded 13 inputs: p50 **765 ms**, p95 **1,061 ms**, p99 **1,157 ms**. This small sample does not establish a network-wide improvement. Prediction does not remove inclusion delay.

[Emulated mobile measurement](evidence/v2/mobile-performance.json): 390 × 844 touch viewport, 4× CPU slowdown, 4 Mbit/s network plus 40 ms latency. No overflow or JavaScript errors; observed LCP 776 ms, CLS 0.083 and p95 frame intervals 6.2 ms during three seconds of replay. These are Chromium measurements on the test computer, not a physical phone benchmark.

## Backups and operations

Pre-cutover backup: **20260906T135334Z**. Post-validation backup: **20260906T140701Z**, followed by **20260906T142431Z** after final gameplay checks. Four databases were restored into temporary databases and compared table by table without changing their sources. The **186 V1 replay states** matched in V1/V2 indexers before cutover. SHA-256-verified copies are stored off the VPS in the operator's protected local directory.

Caddy serves HTTPS with automatic Let's Encrypt renewal. PostgreSQL, Hasura, RPC and relayer remain private. The daily VPS backup timer retains seven days; the Windows offsite task requires that computer to be available.

[Operations, restoration and rollback](DEPLOYMENT.md): `ops/rollback-v2.sh COMMIT` enforces identical V2 contracts and preserves the journal. It rejects original V1 code, which cannot safely own signed V2 transactions. Restoring a journal cannot rewind the chain; reconcile included receipts before resuming an old backup.

## Remaining limits and submissions

- **Interlude is prepared, not integrated**. The transport interface and live/settled separation are documented. SDK, compatible contracts and operator trust still need validation.
- Recovery with the same passkey on a **second physical device** still needs demonstration. Chromium tests do not prove every provider's passkey synchronization.
- Public RPC availability and onchain inclusion remain sources of delay. Betting locks do not eliminate latency advantage.
- The current treasury and administrator are provisional test accounts; immutable treasury replacement requires redeployment.
- [Relevant submissions](QUESTS_V2.md): Mera UX, Mera One Passkey/Many Keys and Envio. Final eligibility depends on the rules and demonstration. Alchemy usage and an active Interlude integration are not claimed.
- See the [publication security review](SECURITY_REVIEW.md) for the final credential/history scan, dependency updates and audit scope. No external security audit or zero-risk guarantee is claimed.
