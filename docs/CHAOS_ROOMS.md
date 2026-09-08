# Chaos rooms on Monad Testnet

**Release status, 9 September 2026: activation blocked at hosted publication.** PONGIT clock recovery and session-read handling are corrected and the CLI is updated to 0.1.4. A new isolated candidate accepted 47 inputs before its first batch reverted. A separate one-slot counter reproduces the same publication failure without gameplay or betting. Public Classic and the financial bindings below remain unchanged. See the [recovery fixes, minimal reproduction and release gate](CHAOS_RECOVERY_2026-09-09.md).

The contract and financial instances below belong to the earlier candidate. Their real betting, pressure, native payouts and three-browser Chaos flow passed on epoch 2. The new recovery app `0x526ef5822169ff21da4e5323d36426df0462dfcb` is **unreleased and has no financial bindings**. Never point its jobs at the earlier candidate's market or reinterpret an old sender journal for a new application.

Rules 4 adds Classic and Chaos to ranked matchmaking, invitations and eight-member rooms. Invitations and shared rooms remain friendly. Classic inherits the previous rooms ratings; Chaos starts at 1000. V4 games, balances, markets and tournaments remain separate.

## Contracts and trust

The immutable application is `0xbb6ba9901acde11da748a6abd1cef2188eef32eb`, chain 10143. Finance bindings are in `deployments/rooms-finance.json`.

| Contract | Address |
| --- | --- |
| Rooms game | `0xbb6ba9901acde11da748a6abd1cef2188eef32eb` |
| Monad window/result adapter | `0x57fc7be3556c0b2260e9125b53ee5f283431b62f` |
| Rooms vault | `0x94f9e1439818ed25599cf500d07fb28dfe97fd84` |
| MarketV4 instance | `0xe2c21ddb660b63c6d27110dc4fc0757f249b2a09` |

The owner approved a provisional **testnet VPS pressure attester**. It reports gross MON actually paid into this market, excluding platform liquidity. This adds trust for paddle handicaps; it is not a trustless base-state proof. The pressure signature cannot choose a winner, alter physics, spend user funds or finalize a market.

Gameplay uses the hosted Interlude engine. Bets, credit and payouts execute on Monad. The browser's scoped game grant cannot buy shares or withdraw credit. Financial spends require an owner signature bound to chain, contract, nonce, amount and deadline.

## Rally boundary

First to seven; ball velocity increases by 10% after every successful paddle return without a gameplay cap, then resets after a point. Both modes keep the previously approved faster initial serve.

Chaos pauses after each nonterminal point. Once Monad contains that exact pause, anyone can open its one-time **40-block betting window**, approximately 12 seconds at 300 ms per block. Two more confirmations precede freezing the cutoff. Publication and submission delays add to this duration. This release does not promise a three-second real-time intermission.

The worker reads paid totals at the cutoff, rechecks its block hash and stores one immutable checkpoint per deployment, match and rally. The signature binds the rally, resume time, source block, checkpoint, amounts and short expiry. Old, altered, decreasing and wrongly scoped pressure is rejected. Retrying can extend expiry but cannot revise frozen amounts. A changed canonical source stops automatic resumption for review.

Below 0.002 MON total accepted cost, both paddles stay 96 units. Up to 60% support gives no reduction; above it, height shrinks linearly by at most 25%, to 72 units. Speed is unchanged and size freezes for the next rally. A delayed checkpoint resumes from the current engine clock without simulating an unseen rally. Participants cannot bet on their own match.

## Financial finality and renewal

A published result remains contestable while its delegation is Active, Exiting or Challenged. `finalizeResult` requires hub status **None**, reads the actual published terminal snapshot and result hash, and freezes the result once. No server-chosen winner or time-since-batch shortcut is accepted.

The lifecycle worker stops admissions an hour before expiry, drains games and publications, waits at least 60 seconds for consent tickets and closes the delegation. It waits the onchain challenge window (currently **one hour**), releases stake, finalizes known Chaos results, renews the same app and checks the hosted node's epoch. A challenge suspends renewal. Operator transactions have a dedicated persistent nonce journal; do not use that sender concurrently elsewhere.

Payouts can wait until the daily delegation closes plus the challenge period. Renewal pauses new games for at least that period. Payment workers operate independently from game commands. Permissionless claims always pay the fixed beneficiary. Rejected transfers retain reserved debts and do not block others. Six automatic attempts precede manual retry. Wallet gains are not automatically redeposited as credit.

## Journals and rollback

The existing production relayer owns the financial sender's nonce. Jobs record `deployment: rooms`, app address and boundary-specific action identity. Signed bytes are immutable. Opening a later rally has a new idempotency key; an old round's job cannot suppress it. Engine jobs include delegation epoch so renewal cannot reuse an old nonce.

`rooms_finance_bindings` persists an immutable fingerprint for each app's financial destinations. Startup rejects a changed market, vault, adapter, pressure signer or indexing origin instead of reinterpreting an existing unsigned job. A new app appends a binding and preserves earlier ones.

Capacity is two games. The measured two-Chaos creation/pause/resume/result cycle writes 49 distinct slots against the 64-slot publication budget. Admission reserves unfinished-game and ELO headroom. Market state remains on Monad.

Preserve all accepted finance manifests, tables and journals across rollback. Never replace a binding beneath pending jobs or restore a sender nonce from an old database. A rollback binary must support rooms financial payloads and continue legacy V1 to V4 obligations. Secrets and backups remain private. `ROOMS_LIFECYCLE_HOLD_RENEW=true` holds a rehearsal after finalization; it never bypasses finality.

`bash ops/rollback-rooms.sh` is the compatible emergency fallback: after backup, it returns the homepage to V4 and closes new rooms admission while retaining the rooms-aware relayer, financial bindings and lifecycle worker. Existing rooms can finish. It does not restore an old database or reverse onchain changes. Protocol marker 3 and the finance-manifest comparison reject older incompatible release rollbacks.

## Validation

Private VPS checks on 8 September include 10,000 differential physics cases per mode, 160 Solidity tests, pressure signatures, eight-member rotation, crossed invitations, two simultaneous games and admission of a waiting third. Three real Monad bets changed the favourite's height to 74.304 units at the next rally. After the actual one-hour challenge window, disconnected winning beneficiaries received exactly 0.008 and 0.002 MON; the losing position received zero. No beneficiary signed to receive. A virtual-passkey browser check separately credited and withdrew 0.02 MON, with fresh owner validation for each spend.

After epoch 2 recovered, the private two-player/spectator browser flow passed: Chaos selection, invitations, automatic spectator entry, responsive controls, F5 session restoration, market restrictions and result dialogs. The three home actions fit at 360 by 640 pixels. Epoch 3 later passed the live-epoch and ELO gate, but its browser run failed during the first duel and the hosted endpoint returned 502. Public rollout remains gated. The [machine-readable evidence](validation/chaos-2026-09-08.json) records measurements and public transaction hashes without private credentials.

### Hosted recovery and rating-preserving cutover

The node `https://il-bb6ba9901acde11d-production.up.railway.app` returned HTTP 502 after the first onchain renewal even though the control plane reported `live`. Operator recovery restored HTTP 200 and SDK epoch 2 at 14:31 UTC. One hosted provisioning request is journaled per epoch; a control-plane response alone never reopens admission.

Classic production had been reopened while the candidate was blocked. Its final ranked result occurred after epoch 2's pinned base block. Both engines were drained before the candidate closed at 14:38:37 UTC. After the real one-hour challenge period, stake release, the browser match's finalization and renewal all confirmed. The engine entered epoch 3 onchain. At 15:46:07 UTC, the hosted `/health` still returned HTTP 502 from the VPS (request ID `UEYeCL0YTxKlt7A_WVMv1w`); a separate Windows request also returned 502. The control plane still reported `live`. Restoring the node for app `0xbb6ba9901acde11da748a6abd1cef2188eef32eb` on epoch 3, including automatic recovery after later renewals, is the operator-side dependency.

Classic admissions are reopened, so a future cutover must drain Classic again and recheck whether its ratings changed after epoch 3's pin. Refresh the delegation if needed. `scripts/rooms-release-check.ts` checks the actual SDK epoch, empty engines and publications, the pinned block, and exact rating inheritance before promotion. Set `INTERLUDE_ROOMS_MANIFEST=deployments/interlude-rooms-chaos-preview.json`, the expected epoch, and the existing Classic players. The private operator and admission workers must stop before their confirmed nonce journals transfer to production. Keep `releaseReady` false until these checks pass.

The private VPS-to-engine sample of 50 commands measured p50 20.666 ms and p95 28.973 ms. This is neither browser end-to-end latency nor Monad financial finality. Virtual passkeys and a normal renewal do not validate physical-device recovery or a malicious operator challenge.

Provider references: [read model](https://interludelayer.xyz/docs/read), [limits](https://interludelayer.xyz/docs/limits). All addresses, credit and bets here are testnet-only.
