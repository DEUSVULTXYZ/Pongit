# Arcade release candidate, 19 September 2026

This candidate is not the public deployment. Public human admissions and Agent Arcade remain closed. The private agent trial started on 18 September completed on its frozen source and dedicated capacity; its service has not been changed by this candidate.

## Assembly

The `codex/arcade-release-20260919` branch combines the human R2 recovery, the gas-bounded rules-8 candidate and the on-chain Agent Arcade strategies. The recovery fixes are preserved, including the operator hold, observations after expiry, uncertain nonces and independent financial finalizations.

The corrected contact semantics use human rules **9** and agent rules **10**. Rules 6, 7 and the already deployed private rules-8 candidate retain explicit historical decoding and projection behavior. The packed snapshot format remains 6; its format number is not the physics rules version.

## Corrected behavior

- Resolve all earliest simultaneous contacts in stable order, including obstacles at force ticks. Revalidate consumed, expired and teleported contacts.
- Expire or activate effects before contacts at the same microsecond. A retired second ball cannot consume a paddle charge.
- Simultaneous hits at opposite paddles retain Hot Potato's prior holder, avoiding a permanent side bias.
- Retry a blocked announcement on the absolute 100 ms game-time grid, not at arbitrary command or gas endpoints.
- A randomness proof arriving during incomplete catch-up advances the state but is not installed at a partial clock. The identical proof can be resubmitted after catch-up.
- Preserve a fast collision search between contacts; allocate the complete candidate set only when a collision actually falls in the current step.

## Local evidence

On 19 September, after these changes:

- TypeScript checking: passed.
- TypeScript tests: **378 passed**.
- Solidity tests, including the new pool and common contracts: **501 passed, 2 skipped**. Skipped tests need the real hub and are not counted as qualified.
- Includes all 276 event pairs, gas-limited catch-up, both multiball goals, force-boundary obstacles, delayed proofs, historical kernel selection and root bytecode size checks.
- Bot command tests retain a **14.8 M execution gas** budget. The longest test sweep was split because the test harness itself exceeded Foundry's total gas budget; the command allowance was not increased.

These are local tests, not evidence of hosted capacity, production availability or the final 24-hour trial. Independent arena rotation, maximum-duration publication/release, browser validation and a new final trial remain release gates.

An isolated VPS run at `b34a088` completed **24,000 Chaos Solidity/TypeScript comparisons with zero mismatches**: 10,000 random, 10,000 simultaneous-contact adversarial and 4,000 historical rules-6 cases. The V2 suite also passed 10,000 Classic and 10,000 legacy Chaos comparisons. The shared kernel is unchanged by the following pool work; admission and pending-control integration still require real execution tests.

The old agent trial ended at 2026-09-19 15:12:57 UTC. Its 1,435 samples measured **66.6899% availability**, with a longest unhealthy interval of about 69.3 minutes. It covered all 24 effects and two simultaneous matches, but cannot qualify this release. Source hashes stayed unchanged. Machine-readable summaries are retained under `artifacts/qualification/20260919` (private evidence, not bundled web assets).

The first isolated deployment of `1d11fb8` was refused by EIP-170 (`CreateContractSizeLimit`): the timeline and complete impact resolver together exceeded 24,576 bytes. They are now separate immutable stateless modules: `ChaosPhysics` 12,350 bytes, `ChaosImpact` 11,033 bytes. A regression checks every kernel module's runtime size. The 94 targeted gas and physics tests passed after this split, without raising the per-command gas allowance. The failed VPS run is retained as `pongit-arcade-physics-1d11fb8`.

## Independent-pool candidate

The candidate now contains the shared Monad catalogue, participation locks, challenge queue, published ratings and tournament contracts, plus independent physics arenas. No admission relies only on a database count. A closed arena remains unavailable until publication, challenge resolution, release and renewal are verified. Construction, private admissions and public qualification are separate gates. The initial common contracts and three private arenas have been deployed; see the subsequent funded-deployment evidence below.

The common contracts freeze tournament entrants and strategy hashes, derive scheduling and tie-breaks deterministically, and validate complete published references before progressing. Local tests cover the four tournament formats, corrections, draw rules, two lanes and epoch reuse. Eight official identities are pinned by registry; display names confer no rights. The eight policies have distinct reaction/placement behavior. VIPER currently aims off-centre without changing the physical bounce rule.

Inputs received during incomplete catch-up now retain progress and queue the latest intention at its actual game-time boundary. The pending controls are packed into unused metadata bits: a regression verifies that publication still fits 64 changed words. `RoomsState` extracts the existing snapshot codec into an immutable linked module to preserve EIP-170 headroom. A concession queued behind catch-up is idempotent and does not rewrite an earlier point.

Remaining implementation gates include qualification scheduling, version-2 SDK/service/UI integration, the human participation lock, deployment and monitoring scripts, and English user documentation. Community strategy bytecode is restricted to immutable pure computation, with external calls, storage and block-dependent inputs rejected. The example build and its qualification must prove that restriction on actual compiled code.

The hub terms read at 2026-09-19 15:23:39 UTC reported maxDelegations 32, a one-hour challenge period, 64 changed words per batch and a 150 M block gas limit. Reserved bond is not a count of available sessions. Pool sizing and worst-case publication/release costs remain unqualified; no public capacity is claimed.

No public manifest has been switched. Private deployment progress is explicitly separated from qualification below.

## Automatic strategy qualification and shared capacity

The catalogue now seals eight identities without pretending they are already qualified. A separate contract selects per-mode friendly trials. It reads published controller decision counters, requires valid responses without invalid ones, and never requires winning. An engine cancellation schedules a retry. Corrections restore the prior qualification and cannot overwrite a newer trial's evidence. After catalogue sealing the operator can revoke qualification but cannot award it in place of that published trial.

The updated full contract run passed **509 tests, with 5 explicitly skipped environment-dependent checks**. The full TypeScript run passed **383 tests**. A further 81 targeted agent tests passed after restricting the operator's qualification authority. These remain local evidence. The immutable pool's dispatch code was split into `PoolPublication` and checked against EIP-170 rather than raising the limit.

The official hub creation bytecode was tested separately, then the same capacity behavior was reproduced on a read-only fork of the **deployed hub at block 63928276**, code hash `0x9380248d1c5debacf028290ca54271acd79f68eedfd91dbc9e605ec19937d8da`. An Exiting delegation still consumes a validator slot until release. No transaction was sent by this fork test. The validator advertises **32 total slots**, shared across its users. This is not a dedicated allocation to PONGIT.

At 16:20:50 UTC the hub still reported a 3,600-second challenge period and a 150 M block gas limit. At least three old, expired PONGIT test delegations remain active in the inventoried addresses; they have not been closed blindly. Reserved stake does not establish the number of available slots. The final arena count and service availability must be qualified against actual admissions and observed full-game/closure durations.

The example strategy compiled without CBOR metadata and passed the runtime opcode verifier (two tests in the separate `strategies` Foundry profile). Version-2 read-only API, signed-intent SDK helpers and a disabled tournament UI are in progress. They are not a public launch. The web build passed with webpack; local Turbopack refused the workspace's external `node_modules` symlink, which is a build-environment limitation, not a passing Turbopack check.

## Private deployment and funding checkpoint

The first private deployment attempt at `8b4698d` installed the physical modules, catalogue, pool, shared ratings, tournaments, challenge and qualification contracts, and sealed the eight official identities. Funding interrupted it before the three arenas. The subsequent completion is recorded below. The catalogue starts unqualified; no successful trial is invented during setup.

| Candidate | Address |
| --- | --- |
| Catalogue | `0xf44577f10a5fe3fd7f76fbca0e95a5fb3454b67c` |
| Pool | `0x10103f05e2dd7bf671cd4b239b534962bf0c0f47` |
| Tournaments | `0xfc45b2aebf4c1d8f086144eb3c208bdfe27a7fa2` |
| Published ratings | `0x7b50ecddf3d544dae9c025a358136a6178d816ce` |
| Challenges | `0xb0d69b867c013216b8a77f56e354b56e2fe6a8f4` |
| Qualifications | `0x1b0c9d605ce1014280f5b78fea2bcf7815651448` |

The next transaction was refused for insufficient balance. At 17:21 UTC, the operator held **0.097424572 test MON**. Pending nonce **1566**, hash `0x0731f0d594249cbee790013e0ae31f57a91a5692cd145d3a9017e5adaad0c389`, remains journaled under its exact original operation. Absence of a receipt is not treated as failure and the nonce has not been replaced. The user was asked to fund the deployment account. The partial private deployment record was copied off the VPS and its hash verified. It contains a private engine key and is not a public artifact.

## Read interface and recovery verification

The latest full TypeScript suite passed **403 tests**. All **81 targeted agent contract tests** passed after sealing the qualification authority. The production webpack build, TypeScript check, SDK bundle/declarations and clean package installation/import passed. The SDK archive SHA-1 is `89aed0b0d8021d8240c237fad91f85505c8127f5`; this is a private candidate package, not an npm publication.

A disposable PostgreSQL instance on the VPS passed fault injection for concurrent hosted creation, atomic lifecycle state/evidence writes, response loss after execution, restart recovery, database nonce uniqueness and old-epoch retirement. These tests used an injected engine transport, not Interlude. The temporary database was stopped after the test and production databases were unchanged.

The version-2 API reconstructs block-pinned catalogue, fixtures, standings, ratings and complete match references. Spectators validate app, epoch, execution chain, rules and participants. Historical matches return their original published result and no replacement node. No spectator key or game transaction is created.

Chrome and Edge each passed **20 captured-build checks**, at 360, 390, 768 and 1440 px plus 844 × 390 landscape. They cover elimination/championship layouts, focus after selection, Classic/Chaos pixel courts, a complete 16:9 court inside the viewport, effect changes without shifting the court, and a transition to the published result. Reduced motion was enabled at 390 px. Two defects found during inspection were fixed: a repeated tournament selection leaving loading active, and a court clipped below the viewport. These browser tests use synthetic API/engine responses; they do not validate passkeys, real matches, physical authenticators, touch input or zoom.

Public human admissions, Agent Arcade and tournaments remain closed. Remaining gates include human challenge/session/sponsor integration, the human participation lock, indexer/replay integration, rules-9 financial validation, complete hosted tournaments, maximum-duration release, actual independent capacity, and a new unchanged 24-hour trial. No new trial has started.

## Signed sponsorship and family reuse

The candidate adds canonical zero-value sponsor routes and tab-local exact-intent recovery, sharing the existing operator journal rather than introducing another nonce owner. The new family helper retains its limited key across F5 and arena rotation. Only confirmed expiry, revocation or replacement requires fresh explicit owner consent; temporary RPC failure never discards the key. Root passkey material is not persisted.

The full TypeScript run now passes **412 tests**, including 9 new sponsor/family tests. A subsequent targeted 11-test run covers lost replies, corrupt replies, 429, simultaneous clicks, foreign targets, administrative/financial rejection, grant expiry and another-device replacement. The TypeScript check and SDK bundle/declarations pass. A separate read-only temporary VPS container passed the HTTP envelope cases: body limits, signature envelope, closed-gate recovery, idempotency and error redaction. Its contract/writer responses are synthetic and it mounted no operator secrets or production database.

This is not a completed human challenge path: the Mera UI, compact arena controls, global human participation, owner-signed active-arena renewal and real cross-arena session reuse still require integration and validation. Community availability currently has no relayed setter in the immutable candidate catalogue; it requires the creator's direct transaction. No sponsor process or new admission flag was activated on production.

The SDK package was rebuilt with these exports and clean-installed again in an isolated VPS container. Its new archive SHA-1 is `088899a84379d936e2bec8003308daa5cbace23a`; the earlier hash above identifies the earlier candidate, not this artifact.

The complete production backup at **20260919T175836Z** was copied off the VPS. The older production script hashes only database dumps, so an additional read-only inventory verified **all 67 files**, including configuration and key files, against the off-VPS copy. The full manifest is retained privately beside it. At **18:13:39 UTC**, the operator still held **0.097424572 MON**, with no receipt for the preserved nonce-1566 deployment transaction. This funding checkpoint was resolved by the transfer below.

## Funded deployment and first real publications

At **2026-09-19 19:20:39 UTC**, the funded operator held **1000.097424572 MON**. The exact nonce-1566 operation was resumed without replacement, confirmed at hash `0x0731f0d594249cbee790013e0ae31f57a91a5692cd145d3a9017e5adaad0c389`, and the isolated deployment exited successfully. The completed private record was copied off VPS with a matching checksum. No production switch was enabled.

Three independent arenas were installed:

| Arena | Contract | First published result | Batches |
| --- | --- | --- | --- |
| 1 | `0xa4f127f53edbaa63f379f0fdec478e50d8fe5dea` | Classic 1–7, 211.498564 s | 279 |
| 2 | `0xda168611985fef4622d12734c4df254425006638` | Chaos 2–4, 300 s | 400 |
| 3 | `0x2edec92e1bab165751192248e6e2a25b4f70e1bc` | Classic 4–3, 300 s | 397 |

The record at **20:03:57 UTC, block 63972922**, verified bytecode hashes, bindings and published results. All three sessions were closing and their results were still contestable. The first release becomes eligible at **20:30:30 UTC**; a timestamp becoming eligible is not proof of a successful release. Later arenas played while earlier ones were closing. The common family is `0xab3104c44c9b9f2368ab147c564427aa1f387c4a`.

The keeper and physics service use frozen source `fe44ef0` in a separate private environment. There were no pending or reverted engine jobs in the post-match sample. The human production and old private trial were not changed. No final 24-hour trial has started.

A public Monad RPC catalogue check returned a **15 requests/s** limit for an unbatched read burst. Grouping compatible reads through Multicall made the repeated check pass. This was a Monad RPC response, not evidence about Interlude's quota. The browser base reader and private sponsor now use the same batching policy.

## Human challenge client candidate

The new client/UI implements remembered Mera account selection, scoped two-hour family reuse, queued challenge restoration after F5, exact arena controls, lost-response reconciliation, owner-signed active renewal/revocation and a result/rematch path. The SDK exposes `createPoolPlayer`. These implementations do not themselves qualify the real authentication path or cross-space participation.

The updated full TypeScript run passed **423 tests**. TypeScript checking and SDK bundle/declaration generation passed. Tests include in-flight direction coalescing, preserved uncertain nonces, exact resend, old-epoch closure, active permission overrides and closing a client during slow recovery. The captured-build browser cases and real human-check harness must be rerun on the frozen version; the latter deliberately uses a synthetic owner and must not be reported as a Mera device test.

