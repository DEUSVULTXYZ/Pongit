# Hub release cost diagnostic, 20 September 2026

This is a read-only RPC fork experiment, not hosted capacity qualification. No
network transaction, real validator signature or provider modification is used.

The live Monad Testnet hub is `0x3Ef8327F69e09cf721772F345e2A887eA22cD595`.
Its runtime code hash at the sampled blocks was
`0x9380248d1c5debacf028290ca54271acd79f68eedfd91dbc9e605ec19937d8da`.
The experiment creates an empty local instance using the pinned SDK constructor,
installs the exact observed runtime and checks the administrator/layout entry
point. A new fork-only validator publishes synthetic mapping diffs to a probe.
These diffs are not gameplay or an execution-validity test.

| Batches | Distinct modified slots | Release gas before refunds | Fits 30 M call |
| --- | --- | --- | --- |
| 1 | 64 | 1,100,051 | Yes |
| 1,200 | 64, repeatedly rewritten | 1,100,051 | Yes |
| 8,564 | 64, repeatedly rewritten | 1,100,051 | Yes |
| 1,200 | 1,200, one new slot per batch | 19,269,235 | Yes |
| 1,900 | 1,900, one new slot per batch | Call exhausted its 30 M allowance | No |

The 8,564-batch measurement used block 64042380. The 1,200-distinct case
used block 64041024, and the deliberately failing 1,900-distinct case used
64041979. Setup and release are separate test transactions; release storage is
cold. Setup gas and refunds do not lower the measured release allowance.

**The number of batches alone is not a release-cost bound.** In this controlled
workload, distinct overlay slots explain the increase. This corrects the earlier
inference that release must replay every batch. The older PONGIT application's
failed 8,564-batch release remains a real failure; this experiment neither
repairs it nor establishes its complete cause.

Before increasing series size, enumerate every reachable delegated write,
including per-match state, participants, authorization revisions and SDK
bookkeeping; then qualify the resulting application and its real release.
Do not turn these diagnostic numbers into a universal slot allowance or remove
the legacy pressure guard without that qualification. Pool post-release capture
and finalization also cost gas beyond the hub-only call measured here.

## Reproduction

Install the locked dependencies, run `npx tsx scripts/prepare-hub-bytecode-check.ts`,
then use `contracts/test/HubReleaseBudgetFork.t.sol`. Set
`PONG_HUB_RELEASE_FORK_RPC` to a read-only Monad Testnet endpoint,
`PONG_HUB_RELEASE_BATCHES`, `PONG_HUB_RELEASE_WIDTH` (maximum 64), and
`PONG_HUB_RELEASE_DISTINCT` (`false` rewrites the same keys).

```text
forge test --root contracts --match-contract HubReleaseBudgetForkTest --gas-limit 1000000000 -vv
```

Without the explicit RPC setting the diagnostic skips. The 1,900-distinct case
is an intentional negative control and fails the release assertion. An initial
8,564-batch harness exhausted temporary ABI-encoding memory in setup; its failed
report is preserved. Separate temporary memory frames fixed the harness before
the passing release measurement. No failed report was relabeled as passing.
