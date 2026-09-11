# Contract authority qualification

Status: HOLD. This document records candidate evidence, not approval to migrate.

The owner subsequently authorized direct production testing and rejected a temporary Monad-only deployment. The target is Interlude first, protocol-gated Monad fallback and warning logs. There is no requirement to create a preproduction site. HOLD here denotes missing technical capability and integration, not missing deployment permission.

Initial evidence was prepared on 2026-09-10 with Solidity 0.8.30, Cancun, via IR, optimizer 200. That revision's arena runtime was 24,524 bytes. The session-lifecycle revision below measures 24,501 bytes (75 bytes below EIP-170); adding code requires rechecking that limit. Prefer fixed modules for new application methods.

## Expanded test audit, 2026-09-11

The [expanded audit](AUTHORITY_TEST_AUDIT.md) fixed room winner-priority, blocked-consent and truncated-leaderboard defects. The current checks passed 197 Solidity tests, all 117 TypeScript tests, nine public HTTPS documentation paths, typechecking, the web build and 20,000 physics comparisons. Two additional tests passed against real deployed hub bytecode in a private fork after an explicitly simulated capacity release. The unchanged network rejects admission with `ValidatorAtCapacity()`; that failure remains a live qualification gate. These results do not represent a deployed candidate or full multiplayer acceptance. See the [source-hashed report](evidence/authority/test-audit.json).

## Session lifecycle revision, 2026-09-11

The candidate now drains a shared delegation after a match result, waits for the other active match and pending proposals, seals engine writes, and closes only from published Monad state. Normal renewal waits for protocol finality, finalizes recorded financial outcomes, preserves rooms/ELO and advances the delegation epoch. This is not an independent per-match hosted deployment. See [reset scope and operator diagnostic](INTERLUDE_RESET.md).

- **193 Solidity tests passed across 17 suites**, including 29 candidate tests. The five new scenarios cover concurrent games during draining, outstanding proposals, missing/wrong-epoch seals, challenge delays, preserved rooms/ELO, rejected commands from an earlier delegation and an independently released stake whose hub tuple has been cleared.
- **31 TypeScript tests passed**: 28 authority/recovery tests and three existing availability tests. The repository typecheck passed. The worker distinguishes a planned closure from a failure and deduplicates epoch-bound close transactions through its journal port.
- The official CLI 0.1.4 checked all four generated surfaces without a layout change.
- The existing physics harnesses were rerun: **10,000 Classic and 10,000 Chaos cases, zero mismatches**. These compare the reused Solidity physics with TypeScript in a private Anvil instance. They do not qualify the hosted engine or a complete browser path.
- Current runtime sizes: arena **24,501 bytes**, actions **24,138 bytes**, lifecycle library **1,272 bytes**. The command allowlist is in the immutable actions module; lifecycle completion is linked code. No upgrade setter was added.
- Storage fixture: **76** net slots for two admissions and **44** for both results, including the new drain marker and terminal references. Sealing adds another delegated marker. Intermediate publication and additional lobby activity still require hosted qualification against the actual 64-diff cap.

Tests ran in temporary resource-limited containers on the migrated production VPS using a private EVM with no exposed ports. Production containers, contracts and data were not changed. No new public contract was deployed. Current evidence is in [session validation](evidence/authority/session-validation.json) and [session preflight](evidence/authority/session-preflight.json); earlier reports below remain historical evidence for their recorded source hashes.

## Verified scope

Candidate tests run in temporary resource-limited containers on the existing VPS. No production service was stopped and no production transaction was signed. Unit tests use a hub fixture and, for recovery only, a test-only `supported()` verifier whose actual `verify()` always rejects. This does not demonstrate a real Chaos bridge.

The final contract run passed **188 tests across 17 suites**, including 24 candidate tests. The six candidate TypeScript tests and repository TypeScript check also passed. The existing Classic and Chaos differential harnesses each passed 10,000 comparisons with zero mismatches. These exercise the reused physics, not a hosted transport or a browser rendering session.

New integration tests attach the real V4 LMSR market and sealed betting vault to the candidate Monad adapter. They check actual paid-pressure counters, rally resumption, a permissionless payment to the winner's wallet, a losing position, participant betting restrictions and an exact refund after game timeout. Amounts and recipients are enforced by contracts. These are isolated EVM transactions, not transfers on public Monad Testnet.

The review also closed a ranked-room invitation bypass, corrected duplicate execution-transition notifications and made maintenance deduplication distinguish successive room rotations and payout attempts. Interrupted encrypted saves verify their complete upload identity before resuming, including when the successful commit response was lost.

The subsequent recovery implementation passed **18 additional TypeScript tests** (24 candidate TypeScript tests in the combined run), plus the repository typecheck. They cover strict protocol time boundaries, 429 isolation, expiry, challenge windows, concurrent triggers, journal reuse after restart, uncertain submissions, unavailable sponsorship, changed generations, reorganizations, pinned-block RPC reads and privacy-preserving warning logs. These tests use controlled ports/RPC responses; they do not constitute a live hosted recovery cycle or prove that production changed. See [recovery validation](evidence/authority/recovery-validation.json).

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
- Connect the candidate contract client and sponsor journal to the UI with generation-aware execution routing. The candidate utility modules are not installed in the production interface.
- Run two players and spectators, F5/recovery, profile/private-data migration, encrypted contacts, consent timing, onchain notifications, actual automatic payouts and sponsor outages on the authorized production testnet deployment once the technical activation prerequisites are met. Test physical-device passkey recovery separately.
- Test business-service shutdown and sponsor shutdown as distinct isolated deployments. Pure contract and client-port tests do not establish end-to-end website availability without the VPS.

## Reproducible artifacts

`scripts/authority-preflight.ts` writes sizes, a combined ABI and explicit readiness gates to `artifacts/authority`. `--require-ready` returns a failing exit code while gates are not qualified. It never reads operator keys or deploys contracts. Foundry and differential output should be retained with the candidate source commit, compiler settings and test timestamp.

Committed reports: [preflight](evidence/authority/preflight.json), [Classic comparisons](evidence/authority/classic-differential.json), [Chaos comparisons](evidence/authority/chaos-differential.json) and [validation scope with source hashes](evidence/authority/validation.json). Source hashes normalize CRLF to LF so they remain comparable across the Windows checkout and Linux test runner. The referenced base commit pins unchanged dependencies and physics contracts.

The source tree includes no candidate deployment address because no candidate contract has been deployed on a public network. Existing production addresses remain authoritative for the live site.
