# Contract authority test audit, 2026-09-11

The candidate is not deployed. This audit expanded the existing tests and fixed three reproducible defects. It does not qualify a complete hosted Classic/Chaos migration.

## Defects and corrections

| Case | Before | Corrected behavior |
| --- | --- | --- |
| Winner declines a proposed duel, then rejoins | The saved winner marker put them ahead of waiting room members | Declining or timing out removes the winner priority; rejoining uses the end of the queue |
| Winner leaves the room, then joins again | The same marker could restore their old priority | Leaving removes the marker too |
| Player blocked between the first and second consents | The second consent could still create the match | The contract rechecks both participants' block status before acceptance; declining the proposal remains possible |
| Truncated or inconsistent leaderboard response | A nonempty short page could silently skip players, or a changed total could truncate the ranking | Reject missing/extra entries, negative totals and totals changing within a pinned snapshot |

The two winner rows describe the same priority defect. New tests also confirm that an invitation cannot silently change the mode of an existing room; that guard already worked.

Documentation browser tests had three stale assumptions: four contract generations instead of the current rooms deployment plus four archives, a `Play now` label replaced by `Matchmaking`, and immediate decoding of offscreen lazy-loaded images. The tests now check the current UI and scroll images into view before checking their decoded content. No production interface behavior was changed to satisfy those assertions.

## Results

| Verification | Result and scope |
| --- | --- |
| Entire TypeScript unit suite | 117 passed, zero failed |
| Solidity suite | 197 passed, zero failed; two optional network-fork tests skipped in the default run |
| Real hub, unmodified Monad fork | Both lifecycle tests blocked at admission by `ValidatorAtCapacity()` |
| Real hub, isolated capacity setup | Both lifecycle tests passed after releasing an expired PONGIT delegation **only in the private fork** |
| Physics | 10,000 Classic and 10,000 Chaos comparisons, zero mismatches |
| CLI 0.1.4 | Four generated surfaces checked, layouts unchanged |
| Types and production web build | Passed |
| Documentation build check | 26 articles, 157 searchable sections, 49 links/images |
| Public HTTPS Chrome paths | Nine passed: six desktop/mobile/landscape sizes, all articles/anchors/assets/404s, opening Docs in a separate tab and search-load recovery |

The fork uses deployed hub bytecode and current validator terms. Its time advances and released capacity are private simulation state. **No public force-close, stake release, deployment, signature or financial transfer was sent.** The successful fork cycle verifies the hub's actual guards, not hosted node publication, epoch discovery, Chaos proofs or a full candidate game.

The production VPS retained its eight running containers. Its filesystem was 80% occupied, with about 9 GB available. Tests used temporary containers with CPU/memory limits and no published ports. The existing live game and sponsor journal were preserved.

## Current network blocker

The unchanged Monad hub rejects `openDelegation` with `ValidatorAtCapacity()` (`0xe90bcd65`). This was reproduced both on a pinned fork and by a direct read-only `eth_call` on Monad. Current terms allow 16 delegations. The validator has 2.2 MON bonded, of which 1.6 MON is reserved, with 0.1 MON required per delegation. The binding failure is simultaneous delegation capacity, not a measured requests-per-second limit.

See the timestamped [direct hub diagnostic](evidence/authority/audit-hub-diagnostic.json). Block timestamps and observer timestamps are recorded separately.

Operator message:

> PONGIT's admission simulation fails with `ValidatorAtCapacity()` on Monad Testnet hub `0x3Ef8327F69e09cf721772F345e2A887eA22cD595`, default validator `0xB28E684815b095aB5Fb324214cfEa63d76F3d691`. Current `maxDelegations` is 16, with 1.6 MON reserved at 0.1 MON per delegation. Please safely retire finished/expired sessions after reconciling their state, or increase the validator's session capacity and available bond as needed. We are not closing another application's delegation. On a private fork, freeing one expired PONGIT slot allowed opening, closing, waiting the 3,600-second challenge window, releasing stake and opening a higher epoch. Hosted publication and node renewal still need a live test once capacity is available.

## Reproduction

From a checkout with its installed dependencies and Foundry:

```sh
node --import tsx --test tests/*.test.ts
forge test --root contracts
npm run typecheck
npm run docs:check
npx next build web
PONG_TEST_URL=https://pongit.xyz npx playwright test tests/docs.spec.ts
node --import tsx scripts/authority-hub-diagnostic.ts --require-available
```

The last command fails while admission is unavailable and writes a diagnostic without signing anything. Network fork checks are opt-in:

```sh
AUTHORITY_FORK_RPC=https://testnet-rpc.monad.xyz \
  forge test --root contracts --match-contract AuthorityHubForkTest -vv

# Private fork only: model available capacity by releasing the known expired app.
# This is not a production cleanup command or an admission-readiness test.
AUTHORITY_FORK_RPC=https://testnet-rpc.monad.xyz \
AUTHORITY_FORK_FREE_EXPIRED_SLOT=true \
  forge test --root contracts --match-contract AuthorityHubForkTest -vv
```

Set `AUTHORITY_FORK_BLOCK` to pin a recorded block. The capacity setup deliberately fails if the known legacy delegation is no longer active and expired; it must not close a different app or manufacture new validator terms.

## Still unqualified

The real two-player/spectator candidate flows, full Interlude to Monad and back cycle, shared publication budget, revocation visibility, account migration and live Chaos payouts have not passed an end-to-end test. They require an available hosted session plus the unfinished candidate browser/sponsor adapters. A fresh contract-verifiable Monad checkpoint transport for Chaos is still absent; `UnsupportedChaosProof` has no positive path. These are implementation/protocol gates, not deployment permission requests. Older passing financial fixtures and public documentation checks do not substitute for them.
