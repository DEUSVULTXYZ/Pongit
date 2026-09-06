# Automatic wallet payments — V4

V4 pays winning bets, tournament prizes and cancellation refunds directly to the fixed beneficiary's Mera wallet on Monad Testnet 10143. An ordinary match awards ELO only. Spending still requires an owner signature; receiving does not.

## Contracts and accounting

The deployment uses new immutable GameV3, ArcadeSessions and Vault instances, plus MarketV4 and TournamentsV4. Game rules, physics and LMSR remain unchanged. Both ratings read through to V3 until first materialized. All module bindings are sealed.

NativePayouts records a fixed recipient and amount before attempting a bounded native MON transfer. A rejected transfer remains a reserved debt. Permissionless retries cannot redirect it or pay it twice. Treasury recovery excludes those debts. One rejected recipient does not prevent other payments or game results.

The market still debits the betting vault for authorized purchases. Wallet gains are never automatically deposited or wagered. Losing positions have no payout or claim button.

## Persistent automation

Envio indexes all four deployments. Result and cancellation events create stable payment candidates. The relayer verifies every candidate against the contracts and stores tasks and discovery cursors in PostgreSQL. It advances completed tournament rounds automatically and submits payments through the existing nonce journal. At most two financial background jobs occupy the pipeline; gameplay commands have queue priority. Rejected transfers retry after 5, 30, 120, 600 and then 3,600 seconds. Manual retries use the same fixed debt and are throttled.

`GET /payouts/:account` exposes amount, versioned origin, state and transaction receipt. `POST /payouts/retry` accepts only a stored payment ID. The interface shows pending, paid, delayed or no payout, and separates the wallet balance from betting credit.

## Migration and operation

Historical indexing uses a separate private RPC gateway to the [Monad Foundation public endpoint](https://docs.monad.xyz/developer-essentials/testnet), paced at 16.7 requests/second below its documented 20-request limit. Gameplay and sponsored writes retain their own gateway. The indexing gateway splits ranges into provider-compatible 100-block requests, preserves filters, returns no partial response on failure, and orders the combined logs. Every subrequest uses its rate budget. This reduces repeated boundary-header reads during backfill. Neither gateway exposes a public port.

The exact addresses, start blocks and successful deployment receipts are in [testnet-v4.json](../deployments/testnet-v4.json). The recursive manifest preserves V1–V3. Existing balances stay in their respective vaults: legacy claims credit that vault, followed by an owner-signed withdrawal. Mera addresses do not change. A new arcade authorization is explicitly required for the V4 game.

Before switching, drain V3 matches and tournaments, back up all databases, keep V3 indexing intact, and finish the V4 Envio backfill in its separate database. Never erase the relayer journal. `ops/rollback-v4.sh COMMIT` accepts only a release with exactly the same V4 and legacy contract bindings; a V3 binary is not a compatible rollback after V4 has started.

Daily sponsorship remains unlimited (`RELAYER_DAILY_BUDGET_MON=0`). A funded relayer and working indexer are required for automatic delivery; fixed-recipient contract payments remain permissionlessly callable during service outages. Delayed wallet transfers remain reserved and visible.

## Validation

Local validation ([contract tests](evidence/payments/contracts.txt), [unit tests](evidence/payments/unit-tests.txt), [20,000 physics cases](evidence/payments/physics-20000.txt), [journal recovery](evidence/payments/journal-recovery.json), [payment recovery](evidence/payments/payment-recovery.json)): 77 Solidity tests (including randomized solvency, rejected recipients, reentrancy, double triggers and refunds); 14 TypeScript unit tests; 20,000 differential physics comparisons; V1→V2→V3→V4 journal crash recovery; full four-player tournament with automatic advancement and exact native prize; browser sessions, direct duels, F5 and revocation; two winning bettors plus a losing bettor, including a beneficiary who left the site before settlement. The real Mera SDK was exercised with Chromium virtual PRF authenticators. Physical-device passkey synchronization is a separate check.

## HTTPS delivery — September 6, 2026

V4 is active on [pongit.xyz](https://pongit.xyz). The browser scenarios passed for passkeys, touch input, betting, signed withdrawals, replay, Chaos handicaps, the encrypted notebook, administration, direct duels, rematches, F5 and session revocation. The first arcade run exposed concurrent reveal gas estimation against the pre-start state; the relayer now reserves at least 350,000 gas for reveal, with both a controlled same-block regression and a successful HTTPS rerun. See the [browser receipts](evidence/payments/https-wallet-payments.json), [arcade rerun](evidence/payments/https-arcade.json) and [reveal regression](evidence/payments/reveal-race.json).

Two winning Mera bettors received exactly 0.003 and 0.005 MON. One had left the application before the result; receiving and returning required no additional passkey assertion. A losing position received zero and exposed no false claim. Two of those bettors played another match while payments settled, with successful input receipts. This demonstrates concurrent operation, not zero scheduling overhead under every workload.

The [four-player tournament](evidence/payments/testnet-tournament.json) advanced two rounds automatically, finished its final 7–6, and paid exactly 0.01 MON to the winner. [Prize receipt](https://testnet.monadvision.com/tx/0xf41929fc0007d752eaa44ca7ba4465c69717dcb288b65a87dfa923f472d387cf). An entrant who never connected received an exact 0.001 MON [cancellation refund](https://testnet.monadvision.com/tx/0x8be193187a246219a97fb47cc52193bc44c823482d1e2ce1beb4538b442a122f). Low-balance operator test scripts wait for Monad's reserve-balance window between value transfers; the sponsored application pipeline already applies that policy. See [Monad reserve rules](https://docs.monad.xyz/developer-essentials/reserve-balance).

[Legacy withdrawal checks](evidence/payments/legacy-withdrawals.json) confirmed exact native withdrawals from each V1/V2/V3 vault through the V4 relayer while preserving prior balances. Both inherited ratings matched V3 for 24 existing players before cutover. V3 matches, ratings and tournaments were drained before pausing the old game/market; all 633 archived snapshots matched during migration.

### Measured performance

The [receipt report](evidence/payments/testnet-performance.json) covers 186 sponsored V4 transactions over 1,110 seconds of mixed functional tests: observed throughput 0.168 transactions/second, not a capacity benchmark. For 32 successful inputs, queue-to-confirmation p50/p95/p99 were **688 / 1,229 / 1,761 ms**. Confirmation observation alone was 324 / 717 / 730 ms. The naturally completed final cost 0.3276808 MON in recorded game gas across 23 transitions; this excludes bets, credits, liquidity and prizes. Monad charges the gas limit, which the report accounts for.

For four positive bet payouts, result-receipt-to-payment-receipt p50/p95/p99 were **3,856 / 7,342 / 7,342 ms**. The small sample is descriptive, not a guarantee. Tournament prize transfer occurs in the tournament-result transaction; automatic advancement happens after the final match. All receipt quantiles use the VPS clock; browser timestamps use the client clock and should not be subtracted from server timestamps. [Payment receipts and timing definition](evidence/payments/testnet-payouts.json).

### Recovery and operations

All eight database dumps were restored into scratch databases with identical table counts. All eight application services restarted successfully. The signed transaction journal through nonce 966 was unchanged, 10 paid tasks totaling 0.033 MON remained unchanged, and there were no duplicate nonces. An open HTTPS browser recovered its arcade session after F5 without another passkey assertion and then revoked it successfully. This was a service restart, not another host reboot. Backups are copied to the protected operator workstation; its scheduled copy requires that workstation to be available. See [operation checks](evidence/payments/operations.json) and [browser recovery](evidence/payments/https-service-restart.json).

The final match replay was reconstructed from 20 chain snapshots and 19 physics transitions, matching Envio and the final contract state. [Replay evidence](evidence/payments/testnet-replay.json).

### Remaining practical limits

The physical second-device passkey recovery test remains separate from Chromium's virtual PRF tests. Rejected native transfers are covered by contract tests; their reserved debts remain retryable. Old vault balances still require a signed withdrawal. Automatic delivery depends on funded sponsorship, RPC and Envio availability. No ordinary victory pays a MON prize.

