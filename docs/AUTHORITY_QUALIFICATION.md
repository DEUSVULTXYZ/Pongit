# Contract authority qualification

Status: HOLD. This document records candidate evidence, not approval to migrate.

Prepared on 2026-09-10 with Solidity 0.8.30, Cancun, via IR, optimizer 200. The arena's runtime is 24,524 bytes (52 bytes below EIP-170); adding code to it requires rechecking that limit. Prefer the fixed actions module for new application methods.

## Verified scope

Candidate tests run in temporary resource-limited containers on the existing VPS. No production service was stopped and no production transaction was signed. Unit tests use a hub fixture and, for recovery only, a test-only `supported()` verifier whose actual `verify()` always rejects. This does not demonstrate a real Chaos bridge.

The final contract run passed **188 tests across 17 suites**, including 24 candidate tests. The six candidate TypeScript tests and repository TypeScript check also passed. The existing Classic and Chaos differential harnesses each passed 10,000 comparisons with zero mismatches. These exercise the reused physics, not a hosted transport or a browser rendering session.

New integration tests attach the real V4 LMSR market and sealed betting vault to the candidate Monad adapter. They check actual paid-pressure counters, rally resumption, a permissionless payment to the winner's wallet, a losing position, participant betting restrictions and an exact refund after game timeout. Amounts and recipients are enforced by contracts. These are isolated EVM transactions, not transfers on public Monad Testnet.

The review also closed a ranked-room invitation bypass, corrected duplicate execution-transition notifications and made maintenance deduplication distinguish successive room rotations and payout attempts. Interrupted encrypted saves verify their complete upload identity before resuming, including when the successful commit response was lost.

Measured in the candidate EVM fixture:

| Scenario | Measurement |
| --- | --- |
| Two fresh queues, two proposals, four consents, Classic plus Chaos | 76 net changed storage slots |
| Both games finish, including new ELO and ranked-player discovery | 41 net changed storage slots |
| Commit a complete 64 KiB encrypted backup | 1,126,228 EVM gas in the fixture with warm storage; chunk storage transactions and cold-access costs are additional |

A read-only production size aggregate found seven notebook records, the largest containing 414 base64 characters, and no saved contacts. No identities or payloads were exported. The 64 KiB candidate limit fits that sample and the existing notebook API maximum; migration must repeat the check against its own snapshot.

Storage counts compare values before and after the scenario and deduplicate slots. They exclude transient memory. They are not a live `interlude_status` measurement. Two admissions cannot be assumed to fit one publication with a 64-diff limit. Intermediate publication must be validated; two game places alone are not a publication-budget reservation.

## Chaos proof qualification

The reviewed reference is Interlude SDK commit `e0c6652de02236597e1c99c404262c43c5ac96db`, especially [security model](https://github.com/Veenoway/interlude-sdk/blob/e0c6652de02236597e1c99c404262c43c5ac96db/docs/04-security.md). The public [limits page](https://interludelayer.xyz/docs/limits) is another reference; use a pinned SDK source when a web page is unavailable or differs from the installed node.

External reads in an engine are pinned to the delegation base block. A client `readSettled`, a fresh RPC response, an `eth_getProof` without an authenticated accepted header, or a VPS-signed amount does not independently establish a current canonical checkpoint inside that engine.

| Required property | Candidate status |
| --- | --- |
| Authenticated recent Monad block/hash, canonical and sufficiently final | No qualified transport |
| Storage proof tied to the exact market and actual paid counters | Interface only; no qualified verifier |
| Binding to deployment, generation, match, rally and closure | Required by `IChaosProof.Boundary`; no positive hosted proof |
| Forged/stale/replayed/reorganized evidence rejected | Shipped verifier rejects all evidence; positive/negative hosted proof matrix is pending |
| No privileged server replacement | No pressure-attester setter or server-signature bypass in the candidate |

`UnsupportedChaosProof.supported()` is false. `returnToInterlude` refuses activation with that verifier. There is no “trust the relayer” feature flag. The Monad path reads the sealed financial adapter directly, with immutable per-rally snapshots of cumulative actual paid amounts. That base-chain path is not claimed to prove the Interlude path.

## Remaining gates

- Qualify a concrete proof verifier and an operator-supported canonical-header/finality source.
- The official CLI 0.1.4 generated and checked the candidate surface: one `words` mapping at slot zero, layout fingerprint `0x66743d908a494bc45ce70b5cddce77cdd196e1c02b00cc51e73e4e2984c5229d`. Linked-module tracing still needs qualification against the hosted runtime. A generator check alone is not that qualification.
- Qualify publication budgeting and both simultaneous terminal results, with intervening lobby activity. Do not activate on the observed 64-diff cap without a successful bounded-publication strategy.
- Run a real Interlude → Recovery → Monad → Returning → Interlude cycle, including missing publication, expiry, challenge, response loss and stale-epoch rejection. Fixture tests cover contract guards, not the operator's behavior.
- Verify prompt engine visibility of session revocations against pinned external hub reads. Browser checks alone cannot substitute for contract enforcement.
- Freeze and validate the legacy source, import full Classic/Chaos registries, reserve usernames and migrate private data with user passkeys. Preserve legacy daily-opponent restrictions at cutover.
- Connect the candidate contract client and sponsor journal to the UI under a private preview flag. The candidate utility modules are not installed in the production interface.
- Run two players and spectators, F5/recovery, profile/private-data migration, encrypted contacts, consent timing, onchain notifications, actual automatic payouts and sponsor outages in that preview. Test physical-device passkey recovery separately.
- Test business-service shutdown and sponsor shutdown as distinct isolated deployments. Pure contract and client-port tests do not establish end-to-end website availability without the VPS.

## Reproducible artifacts

`scripts/authority-preflight.ts` writes sizes, a combined ABI and explicit readiness gates to `artifacts/authority`. `--require-ready` returns a failing exit code while gates are not qualified. It never reads operator keys or deploys contracts. Foundry and differential output should be retained with the candidate source commit, compiler settings and test timestamp.

Committed reports: [preflight](evidence/authority/preflight.json), [Classic comparisons](evidence/authority/classic-differential.json), [Chaos comparisons](evidence/authority/chaos-differential.json) and [validation scope with source hashes](evidence/authority/validation.json). Source hashes normalize CRLF to LF so they remain comparable across the Windows checkout and Linux test runner. The referenced base commit pins unchanged dependencies and physics contracts.

The source tree includes no candidate deployment address because no candidate contract has been deployed on a public network. Existing production addresses remain authoritative for the live site.
