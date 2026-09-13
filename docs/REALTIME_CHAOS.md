# Continuous Chaos betting

Reviewed September 13, 2026. Monad Testnet only.

## Behavior

Rules version 5 removes the 40-block betting pause. Both Classic and Chaos serve immediately after each non-decisive point. The shared three-second match introduction remains a prerequisite to engine acceptance; the queue timer remains browser-monotonic.

Spectators can bet throughout the published live match. Monad retains the LMSR, owner-approved spending, collateral and payouts. The authorized testnet bridge queues cumulative paid MON in the engine. A new checkpoint first catches up using the previous totals, then becomes eligible for a future point boundary. A missing or delayed checkpoint never freezes the ball or changes a collision retroactively. Paddle positions are retained and clamped to the newly applicable height.

The first published result records the engine's end timestamp. Bets mined in or after that final execution second are refunded, including during publication lag. Earlier positions settle normally. A mixed position can receive both winnings and a late-bet refund. Failed native transfers retain a reserved debt. Later challenges are audited without a second automatic payment.

## Public contracts

| Contract | Address |
| --- | --- |
| Game, rules 5 | `0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5` |
| Result and betting-window adapter | `0xb0f8322317ff6d5fafa1f715377197e9264b1b6f` |
| Continuous market | `0x1f1c673e40c9dd682a96842e9da53f6401b64e41` |
| Betting vault | `0xa36b258ed6221aeb66ac9d115740efd4b7c273d5` |

Financial deployment ID: `realtime-v1`. The complete versioned list is in `deployments/rooms-finance.json`. No old funds move automatically. Financial requests include both `app` and `financeId`; match IDs alone are not globally unique.

The new game inherits both ratings from `0xfd1693294fed77304662f08e827b043b0ba386a3`. Before release, `scripts/realtime-release-check.ts` checks that the previous game has no active matches and has not published newer state than the new engine's pinned base block, then compares public profiles' ratings and all four financial accounts.

## Validation

- 241 contract tests passed, two external-fork tests skipped.
- 162 TypeScript tests passed, including 1,000 zero-pressure timing comparisons with Classic.
- 10,000 differential cases per mode on an isolated VPS EVM, no mismatches.
- Real hosted Interlude and Monad games reached seven naturally, including a 7–6 Chaos match. Every observed Chaos frame had `awaitingServe=false`.
- Real paid pressure reduced player A's half-height from 48 to 36 at a point boundary. Subsequent bridge updates were deliberately stopped and the game still finished.
- The disconnected test beneficiary received exactly `0.006 MON` at `0xa6128739a09C75932510543002c635F20f42Aee8`; payout ID `0xfff5083c380e27746c846a12d82e488b534a8d6f72f5388dfa745c6a1e0d8c58`.
- Two paid simultaneous matches and their finishes used 49 distinct changed storage slots in the contract test, below the current 64-slot publication budget. Runtime bytecode is 24,123 bytes.
- Late bets, final-second rounding, losing positions, mixed refunds, repeated claims, reserved failed transfers and treasury reclamation are covered by contract tests.

The real test used disposable EOA owners with genuine SDK session grants. It is not a physical passkey recovery test.

Chrome and Edge passed the production-build checks at 360, 390, 768 and 1440 px: shared countdown, F5 readiness, local queue timer despite a ten-minute server-clock jump, 100 rapid input changes per player, pre-execution 429 and lost response after execution, live betting-window interpretation, losing positions and archived account selection. The simulated one-second network backoff recovered in 1.1–1.2 seconds without a new passkey. PostgreSQL coordinator regression passed twenty queue/cancel cycles and the eight-member, expiry and recovery scenarios.

The HTTPS production test on September 13 at 10:06 UTC used two new friendly players per mode. Both browsers observed 3/2/1; both games advanced into the next rally after a natural point with `awaitingServe=false`. Chaos exposed all three archived betting accounts. No browser errors were recorded. Public evidence is in `docs/evidence/realtime`.

## Production release

The running web and relayer revision is `f902a2ec94e1b8e83cbc4f0e4c66dbdefb36c5df`, activated at 10:05:52 UTC on September 13. Configuration reports rules 5, game and admission available, with no game or payment-worker error in the recorded health check.

The first activation exposed a lifecycle lookup that assumed an unversioned financial adapter. Admissions were closed and the previous release was restored. The fix binds lifecycle management to the router's active manifest. A complete real coordinator startup now verifies this wiring, including all archived finance deployments, before activation. No new player game was admitted by the failed startup.

The code and operator-secret comparison scanned 775 publishable text files without matching an actual production secret. The predeployment backup `20260913T093653Z` was copied off the VPS and its database checksums verified.

## Operations and rollback

Keep the rules-4 manifest, old financial entries, all journals and private backups. This release adds `il_live_pressure` and uses versioned existing finance tables. It does not rewrite old records.

Before activation: verify the offsite backup, disk below 80%, no active previous game, valid new delegation, preserved ratings, sealed financial links and real result publication. Replace only the web and relayer images.

If gameplay needs rollback, first stop new admissions and let the current matches finish. Retain the new finance-capable relayer and all finance entries so new debts can still settle. Select the previous game manifest only after verifying its live delegation and ratings. Never point an old market at a new game or silently reuse a match reference. Keep the new contracts and logs for settlement and audit.

Preserved previous images: `pongit-web:intro-9ea903c` and `pongit-relayer:intro-9ea903c`. The latter is suitable for a pre-admission startup rollback only; after new matches exist, keep the finance-capable relayer. Running images: `pongit-web:realtime-f902a2e` and `pongit-relayer:realtime-f902a2e`.

This release changes the betting timing, not the hosted delegation architecture. The production game still uses its existing shared session model. The signed pressure bridge is a testnet trust assumption, and result publication remains subject to Interlude's challenge mechanism.
