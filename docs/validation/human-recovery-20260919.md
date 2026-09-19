# Human recovery: supervised R2, then rules 8

Prepared on 19 September 2026. **Human admissions remain closed.** Agent Arcade remains private and independent. Approved service and on-chain recovery actions are recorded separately below.

## Approved service deployment, 12:03:35 UTC

The owner approved the R2 service switch with the game closed. Production now points to `7d35926eb7c2aa62e98e2321f5f5ebd295dc2429`. Only relayer and web were replaced. Public configuration reports `admission:false`, `online:false`, `ENGINE_HALTED` and `maintenance.operatorHold:true`; epoch 6 and 190 published batches remain unchanged.

- Relayer image: `sha256:ad38560a8bb7fc68c94fe8a8bcc32d93e3dc52dcdec8dd33d729d4f671cf2bf4`.
- Web image: `sha256:85e79c03d0886d46f71f1fbc88122ee16ffada402cf3d6f49752431f03e828db`.
- 266 tests and the typecheck pass under Node 24.20.0 on the VPS. The first two typecheck attempts exceeded artificially small test-container heap limits; the 1,450 MB heap completed.
- Private backup `20260919T114441Z`: 84 files checksum-verified off VPS. Ten databases restored in a disposable network-isolated PostgreSQL 17 container. All 31,921 COPY rows and sequence values match; owner/ACL restoration was excluded and must be restored separately from production configuration.
- Chrome and Edge: home/docs at 360, 390, 768 and 1440 px have no horizontal overflow or JavaScript exception. This used the exact built assets with the API mocked unavailable, not actual passkey/gameplay qualification.
- Force-close simulation repeated at 12:04:06 UTC: passed, estimated gas 100,902; challenge window 3,600 seconds. The explicit on-chain approval remains separate from the service approval.

## Approved epoch-6 force close, 12:09:14 UTC

The owner separately approved closing the blocked epoch. `scripts/recover-human-epoch.ts` used the existing operator lock 701340 and journal identity `human-recovery-20260919:epoch6-force-close`. Its transaction succeeded in Monad Testnet block **63,878,654**, using **121,082 gas**. The journal is confirmed and the hub reports epoch 6, status 2.

- Transaction: `0x8166d4d381428f057220a51c3f6f953533845827f25db81a1655201e5601c6f5`.
- Hub `stakeUnlockAt`: **2026-09-19 13:09:14 UTC** (15:09:14 Europe/Paris).
- This closes the epoch using its published state, including the unfinished 4:6 match. The unpublished cancellation is not recovered by closure.
- Post-deployment/pre-close backup `20260919T120515Z`: all **86 files** checksum-verified off VPS, now also including both compose files.
- Public configuration still has `admission:false`, `online:false`, `operatorHold:true` and the actual release deadline. No release or renewal has been approved or sent.

## Rules-8 additional validation and review

Candidate `07c9753` passed 54,000 comparisons on an isolated VPS Anvil: 20,000 V2 Classic/Chaos, 10,000 prior rooms Chaos, and 24,000 events-kernel cases (10,000 random, 10,000 simultaneous contacts, 4,000 legacy rules-6 comparisons). Zero mismatches. These compare two implementations; they do not alone establish correctness of shared semantics.

Independent review found two additional defects before hosted deployment: paddle growth could use an unclamped centre at an effect boundary, and a high-speed Multiball slice could exceed the gas reserve despite its one-second duration. Corrections now:

- Re-clamp the contacted paddle using its current height/split before collision resolution; retain legacy rules-6 rendering semantics. Forty-eight boundary cases cover both sides, both screen edges, exact landings and overshoots, six growth/expiry effects, and split-call equivalence.
- Cap each stateless engine attempt at 4M gas, reserve 7M before **every** attempt, and use a 1.5M single-kernel-step fallback after an empty revert. Explicit errors propagate. Preserve changed state even when the processed timestamp is unchanged. Avoid repeated failed full attempts in one command.
- A dense-Multiball regression reverted before the patch at 14.8M command gas. Four vertical speeds from 10,000 to 1,000,000 units/s now progress in successive commands; the measured command cost is about 5.45M gas. This exercises admitted states, not a claim those speeds were reached in a real match.
- A test engine deliberately exhausts the full 4M attempt. The real single-step fallback still stores a ranked seventh point, result and ELO; total measured command cost is about 4.65M gas. All 276 effect pairs pass a one-step call under the 1.5M cap. Zero-time contacts and explicit error propagation are tested separately.

After these fixes, 336 TypeScript tests and the TypeScript check pass. The complete Solidity suite is rerun; hosted qualification remains outstanding. The earlier 54,000 differential result belongs to `07c9753`; the changed kernel requires a new differential run. No rules-8 candidate is deployed or qualified on the hosted node yet.

## Exact candidates and review

R2 was frozen at `b65e0351562d5744d48a734f32ac3bb191384b97` from the concurrently edited recovery worktree. Independent review against production `853f174` found a browser gas-cap retry defect. Commit `135179e` fixes it in the persistent browser command journal. A second independent review found no actionable defect in that four-file fix; 31 focused tests passed. Neither review was a hosted qualification.

The subsequent supervised lifecycle hold prevents broadcasts and hosted renewals while preserving uncertain jobs and reconciling available receipts. It is required for the step-by-step production approvals below. The hold does not disable separate result observers or unrelated existing financial workers.

Local validation of R2: TypeScript passes, 266 TypeScript tests pass, and all 16 historical Solidity gas/recovery tests pass. The Solidity cases demonstrate that **30 million gas still cannot make the old physics safe after every interruption**. R2 is recovery-only.

The separate `codex/human-rules8-20260919` candidate includes sliced simulation and simultaneous contact handling. Its historical rules-6 gas fixture is preserved under `docs/validation/fixtures/`; it is executed on R2, not incorrectly asserted against the corrected rules-8 class. Hosted rules-8 qualification, payments, renewal and browser gates remain required before reopening.

## Pre-deployment facts and simulation (historical)

- Before the approved switch, production `/opt/pongit/current` pointed to release `853f174`.
- App `0x78d3341e3452d7ec1add9371de3008639eed8eb0`, node `https://il-78d3341e3452d7ec.fly.dev`, epoch 6.
- At 11:44:49 UTC the hub still reported status 1 and 190 batches. A read-only `forceClose(app, bytes32(0))` simulation succeeded; estimated gas 100,902; challenge window 3,600 seconds. **No transaction was sent.** Repeat immediately before any approved send.
- Last unpublished Chaos cancellation differs from Monad's running state (4:6, revision 289). Derive the exact match ID from the contract and database; do not copy the inconsistent ID from the earlier handover.
- The room exists in `il_lobby.document`. It contains a different cancelled offer. A missing row in the legacy `rooms` table did not mean the lobby room was missing. Restoration must still preserve any other unfinished offer and otherwise track the match independently.
- The old settlement adapter cannot finalize this match during active epoch 7. Keep its worker and durable result/bettor rows through a later released epoch window.
- Disk usage was 63%, with 26 GB available. No Docker pruning was needed.

## Recovery approvals and execution

1. Export a fresh private backup using `ops/recovery-snapshot.sh`, with no pruning. Copy it off the VPS; verify every file against SHA256SUMS and restore its databases in an isolated disposable PostgreSQL container. Retain the old image IDs and release.
2. Build the exact R2 commit into separately tagged relayer/web images. Test without switching production. Obtain approval to deploy **only those two services**, with `ROOMS_ADMISSION_ENABLED=false`, `ROOMS_CHAOS_ENABLED` unchanged and `ROOMS_LIFECYCLE_HOLD_WRITES=true`. Risk: a short web/API restart and additive recovery-journal schema changes. No contract replacement or user balance migration.
3. Verify public configuration remains unavailable/admission closed and the lifecycle reports `operatorHold:true`. Obtain separate approval for the epoch-6 `forceClose`. Repeat the simulation and use `scripts/recover-human-epoch.ts` with the single existing operator journal (lock 701340). Risk: the unpublished batch is not recovered; only Monad-published state survives. Retain all command bytes and diagnostics.
4. Observe the actual hub `stakeUnlockAt`; never substitute a one-second timer. Obtain approval before stake release, and again before renewal. Keep the lifecycle write hold until the complete approved operation set is agreed. Manually submitted operations also use lock 701340 and immutable journal identities. Never delete/reset `il_lifecycle_jobs`, `il_engine_jobs` or their nonce history.
5. Capture any already published payable results in the released window. An unreadable result is deferred, never marked paid. Keep unresolved financial references through restart and through the next release window.
6. Renew into epoch 7 only after release and approved preparation. Verify app/epoch/expiry, actual node gas acceptance, snapshots and publication. Recover the frozen match from its published state. Do not admit a fresh match on R2. Pending randomness from epoch 6 may remain unusable on that old immutable app; the old result and refunds still need resolution.
7. Qualify rules 8 separately, including Classic/Chaos, proof verification, real bets/payouts, two players/spectator, result consistency, closure and renewal. Validate a safe batch reserve for ongoing matches: a threshold of 600 alone is **not proof** that arbitrary long matches finish below the roughly 1,400-batch release ceiling. Do not reopen based on the threshold alone.
8. Only after all gates, request approval for the new immutable game/finance deployment, manifest/indexer changes and human reopening. Preserve all old contracts and withdrawal paths.

## Rollback

Before each approved service switch, save the exact compose configuration privately and retain the images recorded in the snapshot. Restore the previous relayer/web images and `/opt/pongit/current` only with admissions closed and the lifecycle held. The original `853f174` software does not know the new hold: if rolling it back, remove its lifecycle key-file setting to disable automatic lifecycle writes. Do not roll back a database dump over later transactions. Additive journals remain authoritative.

Contract closure cannot be undone by an image rollback. A renewed epoch never accepts replacement signatures from an uncertain prior epoch. Financial cleanup of the old deployment remains mandatory after switching the homepage.
