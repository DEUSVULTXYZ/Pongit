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

The candidate now contains the shared Monad catalogue, participation locks, challenge queue, published ratings and tournament contracts, plus independent physics arenas. No admission relies only on a database count. A closed arena remains unavailable until publication, challenge resolution, release and renewal are verified. Construction, private admissions and public qualification are separate gates. None has been deployed or qualified on the hosted service yet.

The common contracts freeze tournament entrants and strategy hashes, derive scheduling and tie-breaks deterministically, and validate complete published references before progressing. Local tests cover the four tournament formats, corrections, draw rules, two lanes and epoch reuse. Eight official identities are pinned by registry; display names confer no rights. The eight policies have distinct reaction/placement behavior. VIPER currently aims off-centre without changing the physical bounce rule.

Inputs received during incomplete catch-up now retain progress and queue the latest intention at its actual game-time boundary. The pending controls are packed into unused metadata bits: a regression verifies that publication still fits 64 changed words. `RoomsState` extracts the existing snapshot codec into an immutable linked module to preserve EIP-170 headroom. A concession queued behind catch-up is idempotent and does not rewrite an earlier point.

Remaining implementation gates include qualification scheduling, version-2 SDK/service/UI integration, the human participation lock, deployment and monitoring scripts, and English user documentation. Community strategy bytecode is restricted to immutable pure computation, with external calls, storage and block-dependent inputs rejected. The example build and its qualification must prove that restriction on actual compiled code.

The hub terms read at 2026-09-19 15:23:39 UTC reported maxDelegations 32, a one-hour challenge period, 64 changed words per batch and a 150 M block gas limit. Reserved bond is not a count of available sessions. Pool sizing and worst-case publication/release costs remain unqualified; no public capacity is claimed.

No public manifest has been switched and no deployment result is claimed by this document.

