# PONGIT V1 delivery record — September 6, 2026

This is the historical V1 validation record. **Arcade (V3) is now live**; use the [Arcade delivery report](ARCADE.md) for current addresses, features, tests and limits. V1 new gameplay and markets are paused, while archived replays, claims and withdrawals remain accessible.

## V1 deployment

| Contract | Monad Testnet address |
|---|---|
| Game | `0xb66d62f0eabc5f1f86faca76bebc8353c2fbe0dd` |
| Vault | `0x49ba91379d2b52e219c7969d4fe9a647bf64d52d` |
| LMSR | `0x98f39538f25e80cf2ec0a20fca3258f0db155915` |
| Market | `0x11ba82f64e872b360e6f876ec06725c44536ef17` |
| Tournaments | `0x3420ca36e834aab3d5b6415d867397a916cf25ea` |

Deployed at 2026-09-06T02:59:48.097Z on chain 10143; index start block **60075959**. Superseded manifests document earlier development deployments with archived databases. The site used Mera, self-hosted Envio and public Monad RPC, without Alchemy traffic.

## V1 validation evidence

| Check | Recorded result |
|---|---|
| Physics | 10,000 Solidity/TypeScript comparisons, zero mismatches; [report](evidence/differential.json). |
| Contracts | 20 functional/fuzz tests plus a solvency invariant with 16,384 buys, all passing. |
| Mera | Three SDK/ABI tests, unsupported PRF rejected, account creation/recovery and session closure verified. |
| HTTPS | Two Mera players and spectator, signed cancellation, financial signatures, betting, reconnect, restored session, concession, claim, withdrawal, replay and confirmed touch input; [report](evidence/mera-browser.json). |
| Tournament | Four players, three matches, two rounds and exact 0.01 MON prize; [report](evidence/tournament-testnet.json). |
| Replay | Ten Envio snapshots matched logs, nine reconstructed transitions and final state matched the contract; [report](evidence/replay-testnet.json). |
| Relayer recovery | Isolated Anvil crash before inclusion, identical bytes/nonce/hash and one credit; [report](evidence/recovery.json). |
| Administration | Mera-authorized game/market pause/resume, tournament creation/cancellation and role cleanup; [report](evidence/admin-browser.json). |
| Backups | Restored dumps, identical table counts, indexer recovery and verified offsite copy; [log](evidence/backup-vps.txt). |
| VPS restart | Actual reboot, changed boot ID, seven services resumed, HTTPS and eight indexed matches recovered; [report](evidence/reboot.json). |
| Build | TypeScript, Next.js standalone, relayer and Linux Envio images built; persistent storage and internal service isolation verified. |

## Historical measurements

The Monad probe submitted 30 transactions at a target 3/s: 30 successes/events, observed 3.04/s, p50 **554.8 ms**, p95 **795.2 ms**, p99 **797.9 ms**. This includes 150 ms receipt polling and does not measure network maximum capacity or complete player-input latency. [Data and hashes](evidence/benchmark-10143.json).

Demo match #4 cost **0.1662021 test MON** across 11 Game receipts, covering creation, reveals, inputs, resolution and concession. Market fees are separate. Costs vary with transition count. [Receipts](evidence/match-cost-testnet.json).

Across 101 successful relay transactions during deployment tests, journal insertion to observed receipt measured p50 **1.70 s**, p95 **5.07 s**, p99 **11.23 s**. This mixed sample includes setup/funding periods and excludes the passkey ceremony and preliminary HTTP simulation. [Report](evidence/relayer-latency.json). The subsequent [V1 latency diagnosis](LATENCY.md) records rendering and scheduling corrections.

## Scope and historical limits

The V1 release used a 300 ms/block virtual clock, fixed ball/paddle speeds, expiring commands and a 6 MON daily sponsorship ceiling. **The owner later removed that ceiling for V2.** RPC admission limits and this benchmark did not establish sustained multiplayer capacity.

Passkey tests used the actual Mera SDK with a virtual Chromium CTAP2/PRF authenticator. A physical-device ceremony was not demonstrated by those tests. Treasury/admin were provisional test accounts, and replacing an immutable treasury required redeployment. LMSR supported buying and settlement without share resale. No external audit, interchain transport or zero-latency claim was made.

Backups were private with seven-day VPS retention and an offsite copy dependent on the operator computer being available. An old journal restore requires reconciliation with the chain. Current procedures are in [operations](DEPLOYMENT.md).
