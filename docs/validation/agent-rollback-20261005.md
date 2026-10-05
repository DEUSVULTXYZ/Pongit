# Agent participant reconciliation, 5 October 2026

## Reproduction and cause

The reported Chaos/NOVA game is match 717, arena `0xef9dfabb2af5f9368b6d68c462ffed6e7c94ba08`, epoch 6 (2–6 before cancellation). Its 122 recorded frames do not show a backwards engine clock. Across 82 adjacent transitions with unchanged human input and effects, the Chaos/house predictor reproduces the next recorded physical state within one pixel. This does not establish that the browser presentation was correct.

Actual public Chrome match 720 reproduced the problem with 700 ms held movements, HTTP fallback and an additional 40 ms on each HTTP leg. The old browser verdict passed, but it did not inspect paddle discontinuities. A separate re-audit finds **51 excessive paddle displacements**, maximum **64.584 px**. Original reports and the separate failing re-audit are retained.

Two distinct presentation errors were found:

1. Each new snapshot rebuilt pending movement from its newer, still unsteered paddle position. The later input receipt then rebased it again to the actual execution time. These necessary authority corrections were painted instantaneously.
2. A received clock could advance farther than one rendered frame. Even a correctly predicted bot then visibly jumped during the clock reanchor.

## Change and boundaries

The existing full-scene predictor still owns ball/paddle motion, bot decisions, effects, collision outcomes and speculative point boundaries. A per-match presentation reconciler blends only the difference between the previous picture continued by one real frame and the new reconstruction. It does not retime signed inputs or alter authoritative physics, clocks, scores, nonces or results.

Paddle correction is bounded below ordinary paddle speed. Near either paddle, the ball shares its positional correction; independent ball correction cannot cross a paddle plane. New serves, portals, removed balls, another match and visibility restoration reset the relevant presentation history. PvP and buffered spectators do not enter this agent-participant path. Contractual liveness ceilings remain intact.

The browser probe now records both paddle actors, treats split-paddle pieces as one actor, and rejects excessive single-frame displacement. It records video on request. Local tests include the actual timing pattern from match 720 and the clock jump from match 727.

## Public evaluation

- First deployed candidate `73dce71`, match 727: no excessive human-paddle displacement, no ball jumps over the existing 30 px gate, 83 ms maximum hold, input confirmation p95 210.705 ms under the same HTTP delay. **Failed** the strengthened test because NOVA still jumped twice (9.18 and 10.281 px). This report is not relabelled as passed.
- Revised product `39a5b72`: additionally reconciles clock reanchors and protects paddle-plane topology. Deployed at **05:48:03 UTC**.
- **111 targeted TypeScript tests passed**, including player nonce/recovery, stream ordering, participant prediction, new reconciliation, probe metrics and spectator presentation. Root TypeScript and both Linux Next builds passed. No contract change or new physics-parity claim is made by these frontend checks.

Final actual public runs, all with NOVA and published terminal results:

| Run | Confirmation p95 | Render p95 | Longest hold | Excessive paddle jumps |
| --- | ---: | ---: | ---: | ---: |
| Chrome Chaos 731, 700 ms holds, HTTP +40 ms each way | 187.752 ms | 17.2 ms | 100.4 ms | 0 / 3,788 samples |
| Edge Chaos 733, ordinary connection, 220 confirmed controls and F5 | 18.313 ms | 17.2 ms | 133.4 ms | 0 / 5,604 samples |
| Chrome Classic 736, 700 ms holds, HTTP +40 ms each way | 201.195 ms | 17.1 ms | 183 ms | 0 / 3,748 samples |

Local input p95 was 15.2, 28.4 and 16.3 ms respectively. Both slowed-HTTP runs had zero pause/resume requests; Edge's one resume followed the intentional F5, with its contractually required countdown. Spectator render gates passed in all three runs. Videos, source/paint traces and published results are retained, with hashes and the precise gate definitions in `agent-rollback-20261005.json`. Video frame sheets were inspected.

The renderer gates are bounded measurements, not a claim that every correction is zero pixels: paddle displacement allows physical motion plus 120 px/s correction and two pixels; the existing ball jump gate detects same-rally snapshot displacements above 30 px. The ordinary Edge run had no such ball displacement above 8 px; the deliberately delayed Chaos run still had smaller adjustments, up to approximately 19.25 px. No unexplained hold exceeded 183 ms in these final runs. Full physical-device or long-duration qualification is not implied.

An intervening attempt with an expired, restored virtual authenticator failed before admission: the restored virtual credential did not supply PRF. It remains a separate failed browser report; the fresh-authenticator retry is a different run. These tests do not certify physical passkey renewal. Fresh-session/slow-HTTP admission also remains outside the eight-second gate, independently of the corrected in-game presentation.

## Deployment and preservation

Current web image: `sha256:e032424d0862bb49cb633c480acc22180760441a810d528ece2cd8648832e1b6`, built from `39a5b72`. Human backend, agent roles, contracts, permission scopes, journals, databases and scheduled automation state were preserved. Only Compose service `arcade-web` was recreated.

Build evidence and private rollback configuration are under `/opt/pongit/releases/human-v3-20261005`. Both web configurations were copied off VPS and SHA-256 verified before deployment, under `C:/Users/wwwle/.codex/private-backups/pongit/rollback-20261005`. Final configuration backup hash: `02c91a4ac8b85fd7eed92919e283cc30e0f5bd363462cc16859c31fe406737a8`. Compatible pre-fix rollback image: `sha256:93d7a3f64523813810b3aa963539822aa450e76c56d36d7205b6689ac8d406e4`. Roll back the web image only; do not restore databases over newer games.

Before building, 28 previously verified off-VPS intermediate backup files (1,381,869,958 bytes) were removed locally only after another hash and all-container mount check. Seventeen retired build contexts were archived off VPS with SHA-256 `8b80fb6989dff5b8e5fe3f78b3d5548d687e5d1d1d8c32233dda607a12258b10`; permitted files were removed, and protected files were retained. The initial permission error is recorded. All bytes, including older failed browser evidence, remain in the verified archive. Only an unreferenced intermediate build image from the first successful build was discarded; public and rollback runtime images remain. Disk usage was below 80% before each build.

There is no final 24-hour qualification claim. The user-disabled automation remains paused.

The complete six-run browser evidence, including failed attempts, was also copied outside the worktree to `C:/Users/wwwle/.codex/private-backups/pongit/rollback-20261005/browser-evidence`: 50 files, 54,804,600 bytes, individually SHA-256 verified. The backup manifest SHA-256 is `7b7c80f835a5940fb610d11091973cbfa0f6aa3c57dac184095ded30be428355`. All test drivers finished; final owned fixtures have published terminal results. Public home, catalogue, tournament, configuration and health routes returned HTTP 200.
