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

Local validation ([contract tests](evidence/payments/contracts.txt), [unit tests](evidence/payments/unit-tests.txt), [20,000 physics cases](evidence/payments/physics-20000.txt), [journal recovery](evidence/payments/journal-recovery.json), [payment recovery](evidence/payments/payment-recovery.json)): 77 Solidity tests (including randomized solvency, rejected recipients, reentrancy, double triggers and refunds); 13 TypeScript unit tests; 20,000 differential physics comparisons; V1→V2→V3→V4 journal crash recovery; full four-player tournament with automatic advancement and exact native prize; browser sessions, direct duels, F5 and revocation; two winning bettors plus a losing bettor, including a beneficiary who left the site before settlement. The real Mera SDK was exercised with Chromium virtual PRF authenticators. Physical-device passkey synchronization is a separate check.

Production payment receipts, timings and backup/rollback evidence will be recorded after the HTTPS rollout is verified.
