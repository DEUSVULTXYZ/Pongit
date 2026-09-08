# Chaos rooms on Monad Testnet

**Release status, 8 September 2026: not activated publicly.** The rules-4 contract and financial instances below are deployed. Real betting, pressure and native payouts passed. After a successful onchain renewal to epoch 2, the hosted node returns HTTP 502 while the control plane reports `live`. The existing Classic production remains open; its manifest has not been replaced. Instructions below describe the candidate.

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

Capacity is two games. The measured two-Chaos creation/pause/resume/result cycle writes 49 distinct slots against the 64-slot publication budget. Admission reserves unfinished-game and ELO headroom. Market state remains on Monad.

Preserve all accepted finance manifests, tables and journals across rollback. Never replace a binding beneath pending jobs or restore a sender nonce from an old database. A rollback binary must support rooms financial payloads and continue legacy V1 to V4 obligations. Secrets and backups remain private. `ROOMS_LIFECYCLE_HOLD_RENEW=true` holds a rehearsal after finalization; it never bypasses finality.

`bash ops/rollback-rooms.sh` is the compatible emergency fallback: after backup, it returns the homepage to V4 and closes new rooms admission while retaining the rooms-aware relayer, financial bindings and lifecycle worker. Existing rooms can finish. It does not restore an old database or reverse onchain changes. Protocol marker 3 and the finance-manifest comparison reject older incompatible release rollbacks.

## Validation

Private VPS checks on 8 September include 10,000 differential physics cases per mode, 160 Solidity tests, pressure signatures, eight-member rotation, crossed invitations, two simultaneous games and admission of a waiting third. Three real Monad bets changed the favourite's height to 74.304 units at the next rally. After the actual one-hour challenge window, disconnected winning beneficiaries received exactly 0.008 and 0.002 MON; the losing position received zero. No beneficiary signed to receive. A virtual-passkey browser check separately credited and withdrew 0.02 MON, with fresh owner validation for each spend.

The onchain renewal succeeded; the hosted engine's recovery did not. The final three-browser Chaos match, public rollout and same-app live-epoch check are therefore **not passed**. The [machine-readable evidence](validation/chaos-2026-09-08.json) records measurements and public transaction hashes without private credentials.

### Hosted recovery required before activation

The operator needs to restore the existing node `https://il-bb6ba9901acde11d-production.up.railway.app` for app `0xbb6ba9901acde11da748a6abd1cef2188eef32eb`, epoch 2. Its `GET /health` returned HTTP 502 on 8 September at 13:41 UTC (Railway request ID `qlLpR_4_Qcyt0sBkjUJq2g`). The official control plane's `GET /sessions/:app` still reports `live`. One `POST /sessions` was journaled for this epoch; do not repeatedly redeploy the contract or consume nonces to work around a hosted process failure.

After recovery, verify SDK `status().epoch`, complete the two-player/spectator browser checks and drain all test games and publications. Classic production was reopened while this candidate was blocked, so close/drain Classic again and refresh its pinned base state through a validated delegation cycle before carrying its latest ELO into the new homepage. Preserve the private rehearsal journals; hand over the dedicated operator and admission senders only after stopping their private owners. Then update the active manifest, rebuild documentation, back up and promote. Until these checks pass, keep `releaseReady` false and the rules-3 production manifest active.

The private VPS-to-engine sample of 50 commands measured p50 20.666 ms and p95 28.973 ms. This is neither browser end-to-end latency nor Monad financial finality. Virtual passkeys and a normal renewal do not validate physical-device recovery or a malicious operator challenge.

Provider references: [read model](https://interludelayer.xyz/docs/read), [limits](https://interludelayer.xyz/docs/limits). All addresses, credit and bets here are testnet-only.
