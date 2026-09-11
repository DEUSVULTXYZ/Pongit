# Reliable recovery and independent arenas

## Compatible recovery release

This release repairs the existing shared deployment. Independent per-match arenas are not activated by these changes.

- Expiration stops admissions and engine writes, but terminal observation, room repair, history auditing and receipt reconciliation continue independently.
- Engine jobs retain their raw transaction and nonce. A missing receipt never establishes failure. A matching execution receipt records success or revert.
- Before closure, the writer is fenced. A pending tick can be quarantined only when its signed chain, app, signer and nonce match the journal and the terminal winner, score and nonzero result hash match on Interlude and Monad. Other uncertain operations require review.
- Closure repeats the drain checks after the writer fence, then uses the existing simulated, signed, persistent operator transaction journal. Quarantined bytes become obsolete only after the hub reports the epoch released. They are never deleted or rebroadcast in a new epoch.
- Hosted provisioning stores intent, response uncertainty, confirmation and intervention state. Only an explicit non-creation acknowledgement authorizes another creation request; transport errors and bare 404/503 responses do not. Ambiguity lasting five minutes becomes an actionable intervention state.
- Network availability no longer changes the court's presentation identity. A temporary control outage blends the local paddle instead of resetting it to an older position.
- `/health` distinguishes process liveness, game/admission state and payment health. A healthy process does not imply a playable arena.

## Validation before deployment

124 TypeScript tests passed. The new recovery tests exercise terminal/unpublished/mismatched results, epoch mismatch, non-tick uncertainty, receipt identity, provisioning failures and presentation continuity. TypeScript checking passed.

The isolated VPS PostgreSQL coordinator regression passed twenty duplicate-click matchmaking cycles, eight-member capacity, slow acceptance without a lobby lock, temporary authentication provider outage, real session expiry, and an expired game delegation with a missing tick receipt and a published 2:7 result. The room and history recovered without resending that tick.

At 2026-09-11 21:55:17 UTC, a fresh read of production confirmed that nonce 276 is a signed `tick` for a terminal game, with the same 2:7 score and result hash on Interlude and Monad. Both active count and unpublished diffs were zero. A read-only close simulation succeeded. This observation is not itself proof of a completed close or renewal.

At 22:05 UTC the corrected relayer quarantined that exact terminal tick and closed epoch 1. Monad confirmed transaction `0x8536b031279b715ba0378caa020cff94ca1c9c814ca390d50f4fa48a90e339ae`. The hub's recorded release deadline is 2026-09-11 23:05:08 UTC. Closure is confirmed; renewal still requires release, financial preservation and hosted verification.

The browser now journals scoped zero-value commands in sessionStorage before sending. An uncertain command prevents a different signed transaction; recovery checks the current hub epoch and receipt, then may resend only the original bytes. Local cooldown refusals occur before journal insertion. Successful recovery restores the SDK nonce and keeps the existing grant. New rooms grants last two hours; existing grants retain their signed expiry. No wallet or private-notebook key is added to this journal.

127 TypeScript tests and type checking passed. Contract tests passed, followed by 10,000 Classic and 10,000 Chaos differential physics cases on an isolated VPS runner. The production-build browser regression recovered a 7:6 result through both a confirmed revert and an executed transaction with a lost response, including a ten-second 429 cooldown and room rotation. These injected failures are not measurements of the live provider.

The same build also passed Chrome 152 and Edge 152 on Windows, with the exact frontend assets captured from the isolated VPS build and dynamic mocked RPC responses. A third scenario covers loss before execution and F5 restoration. All scenarios resumed a subsequent match without a new passkey; observed cooldowns were 10,006 to 10,022 ms. Reports are in `docs/validation/recovery-chrome.json` and `recovery-edge.json`. These checks cover 390 and 1440 px; the remaining viewport/load and real multi-arena qualification are separate gates.

Only known PONGIT diagnostic delegations are retired by `scripts/retire-publication-probes.ts`. The two counter fixtures have no financial roles. The abandoned `0x526ef5822169ff21da4e5323d36426df0462dfcb` fixture never had a market and is guarded by zero published batch and zero active count checks. All retirement transactions share the existing operator nonce journal. Closing diagnostics does not make their validator slots available until the hub permits release.

Backup `20260911T214454Z` was copied off the VPS and its database checksums verified. Removal of old PONGIT build caches reduced disk use from 81% to 76%; production images, rollback images and volumes were preserved.

## Remaining implementation and qualification

The accepted target uses Interlude gameplay only, explicit capacity waiting, Monad financial settlement and the authorized signed testnet Chaos pressure bridge. It does not require a trustless Chaos proof for this testnet release or an automatic Monad gameplay fallback.

Remaining gates include real closure/reopening of the current delegation, multiple hosted arenas and per-game closure, the shared Monad lobby and rating journal, cross-arena two-hour authorization, owner-claimed profile/private-data migration, actual Classic/Chaos multiplayer and payout verification, and comparative transport measurements. Existing authority candidate documents describe an older design and are not evidence these gates passed.

## Compatible rollback

Keep the pre-release images and source manifest. New journal columns are additive. Do not downgrade a running lifecycle to software which might send quarantined transactions or stop result recovery on expiry. If a frontend rollback is needed, retain the corrected recovery relayer; stop admissions while investigating. Preserve all engine/operator jobs, financial manifests and settlement audit records. Never reset a nonce or delete an uncertain raw transaction to make a deployment proceed.
