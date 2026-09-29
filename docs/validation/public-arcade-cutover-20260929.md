# Agent Arcade cutover — 29 September 2026

The user's latest instruction authorizes immediate public testnet deployment and
funding, superseding the earlier request to wait for a completed 24-hour trial.
The candidate remains explicitly `testnet-preview`, `qualified=false`, with
`verifiedCapacity=0` and no fabricated qualification reference. This does not
waive migration consistency or command/nonce safety checks.

## Recovery already deployed

At 23:56:08 UTC on 28 September, the public agent engines and keeper moved to
the reproducible d2c6033 image
`sha256:c4a4329a1f2f464f6c710c3355f286f7c7e78cfb04906cac1fcd2e04f7a4763d`.
Their original configuration, database and journals remain. Obsolete source
overrides were removed. Human services and the public web remain unchanged.
The existing healthy pinned engines were adopted despite discovery failure:
7fb epoch 8 and f868 epoch 12. Tournament 9 resumed normally.

Actual public Classic spectator windows, each 60 seconds:

| Browser/run | Match | Ball visible | Moving frames | Frame p95 | Maximum hold |
|---|---:|---:|---:|---:|---:|
| Chrome/recovery-1 | 164 | 100% | 99.47% | 17.2 ms | 116.6 ms |
| Edge/recovery-3 | 166 | 100% | 99.83% | 17.2 ms | 100 ms |

Edge recovery-2 remains a failed whole-window test: match 165 finished during
the observation and its stopped result canvas did not satisfy a live-motion
check. It is not reclassified as a pass. These short windows do not establish
continuous availability, Chaos coverage or physical-device performance.

## Funding and migration

The controlled operator is `0x369158Ac444278541322643E46e0D5b45ac21C4C` on
Monad Testnet 10143. Its balance increased by 10,000 MON. A journaled 6,000 MON
transfer to the external publisher `0xB28E684815b095aB5Fb324214cfEa63d76F3d691`
confirmed at block 66543259, transaction
`0xaf687cf64bb0cb99dc961006d6a1e6af9db5aef5da8ac17a25303d57bf5eb25d`.
This account is shared and not controlled by PONGIT. Do not repeat this transfer.
The remainder is retained for deployment and limited service signers. It does
not fund the previously estimated full 24-hour five-arena workload.

Source pool: `0x708e32a09a1f5c0d4de2477793a7d6e8d9c1b8e5`.
Source seed audit passed against canonical block 66542084: ten owner nonces
from 2935 through 2944, no seed/pair-seed calls before the irreversible seal.
The migration continues this public season, not the unrelated private pool.

The sole drain monitor started at 00:09:01 UTC, with fixed deadline 00:57 UTC.
It waits for tournament 9 to complete normally, then journals the four closed
admission gates and waits for both lanes to clear. It runs inside the existing
public keeper; do not restart that keeper or create a competing drain writer.
Its report is `diagnostics/cutover-20260929/drain.json` under the public release.

The staged migration namespace is `reusable-agents-20260929-1`, eight configured
arenas, one tournament lane and four independent friendly house instances.
Deployment must preserve all source identities, rating/repetition history,
pending challenges, qualifications and the current family authorization.
Configured arenas do not establish usable capacity.

Backup `arcade-cutover-20260928T235200Z` contains agent/operator/replay database
dumps and private runtime, with all four hashes verified off VPS. Refresh it
after the final drain and migration. Never restore an old database over newer
transactions. The exact previous recovery Compose is retained as
`compose.json.bak-recovery-d2c6033`; use it only with current credentials and
journals if rolling service code back.

Remaining work: complete drain/import; prepare scoped roles and real arenas;
deploy API/web/Compose indexer and Hasura together; verify real public catalogue
admission, controls, F5 and concurrent copies; preserve replay/history routes.
Full endurance, worst-case hosted reserve and final financial/migration checks
remain unqualified until their corresponding evidence exists.
