# Arcade release candidate, 19 September 2026

This candidate is not the public deployment. Public human admissions and Agent Arcade remain closed. The private agent trial started on 18 September continues on its frozen source and dedicated capacity.

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
- TypeScript tests: **376 passed**.
- Solidity tests: **467 passed, 2 skipped**. Skipped tests are not counted as qualified.
- Includes all 276 event pairs, gas-limited catch-up, both multiball goals, force-boundary obstacles, delayed proofs, historical kernel selection and root bytecode size checks.
- Bot command tests retain a **14.8 M execution gas** budget. The longest test sweep was split because the test harness itself exceeded Foundry's total gas budget; the command allowance was not increased.

These are local tests, not evidence of hosted capacity, production availability or the final 24-hour trial. Hosted differential physics, independent arena rotation, tournament reconstruction, maximum-duration publication/release, browser validation and a new final trial remain release gates.

## Pending architecture

The approved next step is a pool of independent physics arenas, with the identities, participation locks, tournaments and ratings outside those delegations on Monad. No admission may rely only on a database count. A closed arena remains unavailable until publication, challenge resolution, release and renewal are verified.

The common contracts must freeze tournament entrants and strategy versions, derive scheduling and tie-breaks deterministically, and validate published match references before progressing. Eight official identities must be pinned by registry; a matching display name or metadata hash is not sufficient.

No public manifest has been switched and no deployment result is claimed by this document.
