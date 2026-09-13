# Smaller room commands

Qualification date: 2026-09-13 UTC. Application build: `64943a71b3893a47880f6ac4bb3100ca6aefa78b`.

## Change

The previous room deployment stopped publishing at batch 29 with `413 Payload Too Large`. Every SDK-wrapped movement repeated the scoped grant and its owner signature. PONGIT now verifies and caches that original grant once per control key and engine epoch. Subsequent movements are direct, zero-value transactions signed by the same limited game key.

The contract verifies the owner, key, application, base chain, selector scope, expiry and current delegation epoch. Cached permissions cover acceptance, movement, ticks, cancellation and concession only. They do not authorize bets, withdrawals, private data or administration. Revocation leaves a tombstone that prevents registering the same revoked key again. F5 reuses an existing valid binding. Uncertain commands retain their exact signed bytes and nonce until reconciled.

This required an immutable replacement arena. It retains rules version 5: first to seven, 10% acceleration on successful returns, reset after each point, continuous Chaos rallies and late pressure applied at a later point boundary. It does not implement the separate, previously proposed per-match arena architecture.

## Deployments

All addresses below are on Monad Testnet, chain 10143.

| Contract | Address |
| --- | --- |
| Compact rooms game | `0x695307022ac7add03117e8f3b59369d7ee7a4724` |
| Financial adapter | `0x4fe0ffb1a31b5264a996385acbf68dfb493800b0` |
| Realtime market | `0xb3ea20c94706e9c3fc939db032ca6631ad3a3177` |
| Betting vault | `0xd533fe18d5687bebfb918c84adcffb1532052dc1` |

The new game's hosted endpoint is `https://il-695307022ac7add0.fly.dev`. Delegation epoch 1 opened at block 62168817. The published runtime is 24,563 bytes, below the 24,576-byte EIP-170 limit. Game creation plus two simultaneous games, four control bindings and their results touched 45 unique application storage slots in the contract test, within the node's 64-slot publication budget.

## Measurements and real-chain qualification

| Measurement | Result |
| --- | --- |
| Equivalent signed input fixture, wrapped SDK | 911 bytes |
| Equivalent signed input fixture, compact | 237 bytes, 74% smaller |
| Inputs in the successful real load run | 415, 236 to 237 bytes each |
| Other signed game transactions in that run | 77 ticks, 4 registrations, 4 acceptances, 4 revocations |
| One-time registration size | 751 bytes |
| Tick size | 139 to 141 bytes |
| Input response latency from VPS | p50 110 ms, p95 122 ms |
| Restored control senders during play | 4, after 50 changes each |
| Classic load match | `202609131030`, result 6:7, 102 changes per player |
| Chaos load match | `202609131031`, result 4:7, 109 and 102 changes |

Both load-match results were read back from Monad. The paid Chaos test delivered a pressure update and observed the minimum paddle half-height of 36 units. Stopping the pressure worker did not stop subsequent rallies. A winning beneficiary received 0.006 test MON in its wallet without a receiving signature. Payout ID: `0xc138860f334a8eb68a801c78b01cb7e9560b4f554cd0c5589b9a62d4834dd1cc`; beneficiary: `0xe490e1D6E936D97B47D40a74f3e5326f8e2628eA`.

A separate real hosted run started Classic `202609139000` and Chaos `202609139001` together, verified `activeCount == 2`, completed both 7:6 and read both results from Monad. Ranked winners reached 1032 and losers 968, once per result and in the correct mode. All test games finished and their control keys were revoked. No 413 was observed in these successful runs.

These are raw signed-transaction sizes, not a measurement of the operator's private publication HTTP envelope. The latency is VPS-to-engine command response, not end-user rendering latency or final settlement. No universal payload ceiling or permanent absence of 413 is inferred.

## Other checks

- 247 Solidity tests passed; two environment-gated fork tests were skipped. Hosted qualification above used real deployments separately.
- 170 TypeScript tests and the type check passed.
- 20,000 differential physics cases passed: 10,000 per mode.
- The production web and relayer images built successfully.
- Chrome/Chromium and Microsoft Edge 153 passed isolated production-build browser tests with simulated API/chain responses: countdown, browser-local queue timer despite a ten-minute server clock correction, F5, narrow viewports, reduced motion, injected 429 before execution and lost response after execution. Recovery took approximately 1.1 to 1.2 seconds with a one-second injected cooldown.
- Candidate coordinator startup passed with admissions disabled and all five financial manifest entries loaded. Twenty existing profile/mode ratings matched their previously published values. Each old financial account endpoint remained readable.
- A scoped audit of 812 publishable files found no actual private operational values. Private grants, transaction journals and credentials remain outside Git.

Earlier fixture failures were corrected before acceptance: the first run did not reach 100 direction changes per player; the second incorrectly applied a player-grant journal to the coordinator's pressure transaction. That exact pending transaction was reconciled to a confirmed expired revert, and its test match was completed. Neither failure was hidden as a passing test.

Physical cross-device passkey recovery and human audio listening were not retested for this transport-only change.

## Production verification

The new web and relayer were activated at 11:57 UTC with admissions initially disabled, then opened after a healthy app/epoch check. Release `f3657cb0e71489b8763e958e9f9e9ba1ad8791d1` uses application images built from `64943a71b3893a47880f6ac4bb3100ca6aefa78b`. Both `main` and `codex/contract-authority` were published without rewriting remote history.

At 11:58 UTC, two real HTTPS browser players per mode accepted their friendly offers on `pongit.xyz`, observed 3, 2, 1, moved with 236 to 237-byte inputs, refreshed during play and reused exactly one registration per player. Both modes continued immediately after a natural point. The scenarios ended by explicit test-player concession, not by a fabricated seventh point. The earlier load tests above covered natural seventh-point finishes.

Both HTTPS results were read back from Monad at 12:00 UTC, with batch 36 published, the service online, admissions open and no publication incident latched:

- Classic: `88550698812206991011438836724570406613711066444225708476368028999963483560245`.
- Chaos: `78613776374224252629870910668543495740465703924659510214912369909849754256295`.

The pre-release backup `20260913T115230Z` includes databases, configuration and private operational state; the off-VPS database copies were checksum-verified. Previous production images remain available.

## Preservation and rollback

The old game `0xd2fe1c8df2bdbe2666409fc20f25bcd2f2a40fb5` remains archived. Its interrupted user match still had live score 6:1 and published score 1:0 at the release check. No winner, refund, nonce replacement or cancellation was invented. The unresolved old transaction `0xdc3c70f8eb20da150b4db2e00ffdf6c72c19da0c571bbad71febdac6bfc68429` remains in its original journal. Old financial manifests, balances and rights are retained, with no automatic transfer.

Before activation, back up databases, private operational state and runtime configuration; verify the off-VPS copy. Start the new web and relayer with admissions disabled, verify the exact app, healthy delegation and financial archives, then enable admissions. A new deployment needs one explicit arcade authorization; subsequent games and F5 reuse it until expiry.

For rollback, first disable new admissions and allow the new application's active games to finish. Keep the compact-capable relayer and the complete financial manifest so that new and old payments remain serviceable. Restore the previous web image only together with its appropriate routing/maintenance state. Do not pair an old wrapper-only client with the compact app, drop new journals, or interpret the halted old application as recovered. Retain both pre-release images and the compact images until the release is verified.
