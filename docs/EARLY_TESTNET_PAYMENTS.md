# Early testnet room payments

This policy is enabled only for new markets tagged `early-published-testnet` on Monad Testnet (10143). It accepts the first terminal Interlude result published to Monad without waiting for delegation closure or the protocol challenge period. It is not a finality guarantee. Later corrections can make an already completed test-MON payment inconsistent with the corrected winner. The owner explicitly accepts that testnet risk.

## Settlement and compatibility

`RoomsEarlySettlement` reads the participants, result hash and winner from the deployed game. A caller cannot supply those values. An open fraud or availability challenge prevents initial acceptance. Once accepted, the market's result is immutable: corrections do not generate another payout or reverse a completed transfer. A refused transfer remains a reserved, retryable debt under `NativePayouts`.

The new adapter, MarketV4 and RoomsVault form a separate, sealed financial deployment. The game, physics, ELO and player session permissions do not change. An ordinary victory does not introduce a MON prize. New betting credit is separate from previous credit; withdrawals still need the owner's passkey.

`roomFinance` identifies the generation in every new relayer job. An omitted field selects the original manifest, never the latest one. Existing job payloads and original manifest entries must remain unchanged. PostgreSQL binds each match to its market in `il_match_finance`; current and previous accounts are available from the account selector. Existing V4 and older financial routes remain separate.

The worker discovers terminal published hashes from unsettled bettors without relying on `il_results`. It captures new-market results before the next delegation renewal; native transfers may complete afterwards. Early payments do not repair expired delegations or isolate game sessions.

## Persistent challenge audit

Public acceptance and hub lifecycle facts are retained in `il_settlement_events`, including UTC observation time, application/generation, epoch, batch, result hash, winner, transaction and block hashes. Fraud challenges, availability challenges, resolutions, timeouts and state unwinds have distinct event names. A challenge is not proof of fraud.

`il_settlement_challenge_report` associates challenged batches with accepted results from the same epoch at that batch or later. These are potentially affected results, not proof that every associated match changed. `il_settlement_checks` records observed result-hash differences. `il_payment_receipts` and market `Claimed`/`PayoutPaid` events establish which amounts actually reached wallets.

The scanner uses 100-block RPC pages, a persistent block/hash/epoch cursor and two-block observation lag. On a cursor reorganization it marks old observations noncanonical and replays from deployment. Evidence is retained rather than erased. Correction checks are queued durably so a failed RPC read is retried after restart. These financial audit tables are included in ordinary private PostgreSQL backups, not the seven-day diagnostic-log cleanup.

Inspect on the VPS:

```sh
docker exec pongit-postgres-1 psql -U pong -d pong_relayer -c \
  "SELECT kind,match_id,epoch,tx_hash,canonical,observed_at FROM il_settlement_challenge_report ORDER BY observed_at DESC;"
docker exec pongit-postgres-1 psql -U pong -d pong_relayer -c \
  "SELECT scope,id,epoch,accepted_hash,observed_hash,observed_block FROM il_settlement_checks;"
docker logs --since 24h pongit-relayer-1 2>&1 | grep rooms-settlement
```

An empty report means no challenge has been indexed for the covered period. Check `il_settlement_cursor`, current block and `rooms-settlement-audit-unavailable` before treating that as an absence of challenges. The audit does not claim to discover every past challenge before this financial deployment.

## Deployment and rollback

1. Back up PostgreSQL, manifests and private operational journals. Preserve the current images.
2. Stop the operator nonce owner while running `scripts/deploy-rooms-early.ts`. Set `EARLY_DEPLOY_KEY_FILE` and an absolute `EARLY_DEPLOY_JOURNAL` outside the repository. The script signs and persists each raw transaction before broadcasting; a retry checks the same hash. Do not discard an uncertain step or start another deployment with the same nonce.
3. Verify receipts and sealed links, then append the new entry in `deployments/rooms-finance.json`. Preserve all previous entries. The script does not activate services.
4. Deploy the compatible relayer and account UI together. The active market for new matches is the last manifest entry for that game; existing markets remain bound to their original entry.
5. Check the worker's cursor, health and both account generations. A real multiplayer payout test requires a functioning Interlude delegation.

After any new financial job or market exists, do not roll the backend back to a version that does not understand `roomFinance` and the new manifest. Keep this compatible payment worker running when reverting unrelated UI/game changes. To stop new early-market betting, pause the new market with its existing pauser role; claims and reserved-debt retries remain available. Preserve database tables, journals and the appended manifest. Do not redirect current matches to the old market.

## Validation scope

Solidity tests cover active and exiting sessions, known challenges, missing publication, epoch changes, recovery after release, first-result immutability, losing positions, refunds, refused receivers, retries and financial permission boundaries. Existing market finality tests remain unchanged.

`scripts/test-rooms-finance-persistence.ts` runs against an isolated PostgreSQL database on the VPS with deterministic RPC fixtures. It covers generation routing, discovery without a lobby result, worker restart, challenge association, RPC failure during correction checks, retained orphaned evidence and no repeat payment. It is not a live hosted-Interlude or real-wallet payout measurement.
