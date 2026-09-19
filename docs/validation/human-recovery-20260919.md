# Human recovery: supervised R2, then rules 8

Status on 19 September 2026: **human admissions remain closed; no recovery transaction or production deployment has been sent**. Agent Arcade remains private and independent.

## Exact candidates and review

R2 was frozen at `b65e0351562d5744d48a734f32ac3bb191384b97` from the concurrently edited recovery worktree. Independent review against production `853f174` found a browser gas-cap retry defect. Commit `135179e` fixes it in the persistent browser command journal. A second independent review found no actionable defect in that four-file fix; 31 focused tests passed. Neither review was a hosted qualification.

The subsequent supervised lifecycle hold prevents broadcasts and hosted renewals while preserving uncertain jobs and reconciling available receipts. It is required for the step-by-step production approvals below. The hold does not disable separate result observers or unrelated existing financial workers.

Local validation of R2: TypeScript passes, 266 TypeScript tests pass, and all 16 historical Solidity gas/recovery tests pass. The Solidity cases demonstrate that **30 million gas still cannot make the old physics safe after every interruption**. R2 is recovery-only.

The separate `codex/human-rules8-20260919` candidate includes sliced simulation and simultaneous contact handling. Its historical rules-6 gas fixture is preserved under `docs/validation/fixtures/`; it is executed on R2, not incorrectly asserted against the corrected rules-8 class. Hosted rules-8 qualification, payments, renewal and browser gates remain required before reopening.

## Live facts and simulation

- Production `/opt/pongit/current` still points to release `853f174`.
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
