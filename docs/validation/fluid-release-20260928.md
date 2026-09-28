# Fluid PONGIT candidate — 28 September 2026

Status: implementation and bounded hosted qualification. **No production changes and no final 24-hour trial. Five simultaneous hosted matches passed; sustained capacity, rotation and migration remain unqualified.**

The approved release has one cutover after qualification. Preserve the existing human release, public agent preview, old contracts, withdrawals, identities, ratings, replay references and uncertain transaction journals. Never substitute a fresh private season for the public migration.

## Reproduced production failure

Read-only checks at 00:35 UTC found no active agent games and the last tournament almost three days old. The control-plane directory returned 404 for arena `0xf868bdb4669f4de471555ccadc3bac5589a3fcaa`; its known Fly endpoint identified the correct active epoch 10, chain 4242 and base block 66021799. Provisioning uncertainty blocked that endpoint's adoption. The legacy keeper also required every selectable idle arena to be healthy. Disk usage was 55%, with roughly 31 GB free.

Production remains `/opt/pongit/releases/e4eceb6`, web `smooth-ba79044`, with mounted role fixes. Its exact mounts were inspected without printing environment contents. The shared Hasura container is not managed by Compose. It must be brought under reproducible configuration and its database password rotated during the approved cutover, preserving metadata and data.

## Candidate implementation

- Pinned-node inspection precedes directory discovery. Adoption verifies application, chain, epoch, base block, rules, canonical runtime and publication health. Uncertain creation journals and retry deadlines remain intact.
- Five agent lanes have independent assignments: tournament 0, friendly/qualification lanes 1–4. Epoch-scoped admission exclusions do not edit active games or results. Old two-lane decoders remain supported.
- Linked, immutable admission and result-verification libraries keep the new pool within Monad's 32 KiB code limit. No physics rule changes.
- House-instance tests cover all 120 result-capture orders, competitive-lock isolation, unique references, stale epochs and operational permissions.
- A persistent keeper replaces process-per-step startup. The five-lane candidate separates admission, lifecycle and archive roles; a separate sponsor accepts only canonical, signed, zero-value player calls. Legacy signers retain their original lock and journal namespace. Scoped role keys cannot silently adopt an old queue.
- Reads coalesce and overlap within a bounded transport. Player authorization checks prefetch and expire explicitly. Lost commands keep their original journal and nonce.
- Versioned SSE invalidations share a polling source and retain browser polling fallback. Catalogue labels distinguish unavailable infrastructure, occupied capacity and compatible agents.
- Spectator playout uses a 300–1,000 ms buffer; score, effects and timer follow displayed state. Terminal snapshots drain before the result replaces the court.
- Shared Pixel Palace chrome, two/four-column cards, 44 px controls and consolidated agent/tournament styles replace conflicting agent overrides. Docs avoid region probes.

## Evidence so far

These results are local or simulated unless stated otherwise, not hosted qualification:

- Root TypeScript passed through run 8. Full TypeScript suite: 734 passed (run 3).
- Full Solidity suite: 820 passed, seven opt-in fork/profile tests skipped. The separate strategy profile passed its two checks. The targeted pool suite passed 114 checks, including all 120 capture orders.
- Runtime limits and the complete deployment library graph pass. Earlier oversized builds remain preserved.
- Differential physics: 10,000 Classic and 24,000 Chaos comparisons, zero differences. Chaos includes simultaneous-collision and historical-rule scenarios.
- Chrome/Edge built-site fixtures: 54 checks passed at 360, 390, 768, 1440 px and landscape. Both modes, court fit, result, replay, focus and reduced motion pass. API/chain inputs are synthetic. A subsequent shared action-button cleanup still needs its final build check.
- Real isolated PostgreSQL writer integration passed at 01:14:10 UTC: concurrent intake, deduplication, lost execution reply, restart, exact-hash resend, signer separation, queue ownership and graceful drain. RPC execution was simulated; no real transaction was submitted by that test.
- Actual hub bytecode on a read-only fork: 16,000 dense 1,233-byte batches over 256 distinct overlay slots released in 4,170,937 gas before refunds, below the 30 million allowance (block 66279848). This is not hosted publication proof. The 64-slot run used 1,100,089 gas.
- Actual hub terms at block 66274740: 72 maximum delegations, 256 diffs per commit, 604,800-second maximum session, 3,600-second challenge window. A fork admitted eight additional probes; that is a lower bound on that fork, not a hosted reservation.
- Both new Compose definitions pass `docker compose config --quiet` with placeholder paths/values; no containers were changed by that check.

At 01:37 UTC the deployer had approximately 654.625 MON and the shared publisher 40,500.886 MON. No funding request is warranted from this check. Consumption by other apps remains separate.

The new migration script requires a closed, drained source, exact source hashes, canonical seed audit, paged identity/ledger/queue imports and unchanged family. It leaves all public gates closed. It has not yet been run against the public source or a real private predecessor. Archive-only workers keep historical recovery active even with admissions closed; the replacement skips inherited tournament IDs and synchronizes predecessor rating corrections/finality.

Local diagnostic files are under `artifacts/candidate-20260928-*` and `artifacts/qualification/20260928/`. Preserve failures and distinguish each new run.

## Remaining delivery gates

1. Finish and review role separation, persistent scheduler behaviour, safe replacement recovery, five-lane monitoring and scoped nonce integration tests. Freeze a tested commit before private deployment.
2. Finish reproducible five-lane Compose, shared Hasura configuration, role-key provisioning and rollback without database restoration over new transactions.
3. Complete the `Continuing*` migration path from verified canonical public state, including pending requests, permissions, repeat counters and tournament ordering. Recheck differences at the final drain before sealing imports.
4. Qualify actual owned Interlude capacity without provider changes or human slots. Measure publication/release reserve and worst-case duration. Do not copy the old 16,000/8,000-batch policy as a five-lane proof.
5. Finish common UI review, rebuild, Chrome/Edge mobile/landscape/zoom/accessibility checks and actual human controls. The current screenshot fixtures do not prove hosting, passkeys or latency.
6. Run the complete Solidity suite, 24 effects and 276 pairs, and 10,000 Solidity/TypeScript comparisons per mode. Test human finances, recovery, historical routes and replay retention.
7. Run five real agent matches alongside two human matches, including four copies of one house bot and its tournament. Complete all four tournament formats and real community qualification.
8. Freeze the complete candidate for a new 24-hour trial with all-role source hashes, latency/clock/render metrics, traffic, cost, storage and verified renewal. Required availability is at least 99.5%, with no global renewal outage.
9. Back up, restore-test and verify the off-VPS copy; audit/publish; drain; import final differences; cut over all components once; verify public journeys. Production stays unchanged until these gates pass.

No new funding request or provider action is currently justified. The old follow-up automation remains paused with a stale September 21 prompt; do not resume that prompt unchanged.

## Checkpoint — 28 September, 02:35 UTC

Candidate commits `6b07315`, `a7c022d`, `8c5d49c` are local, not published. The private services use immutable image `pongit-agent-qualification:fluid-8c5d49c`, ID `sha256:610c7ab0360c9e4b019ac306b853ce41f43eb009810c525008f17c41c4d300c9`. New UI, observation-gate, scheduler and qualification-driver changes remain uncommitted. Do not label this the frozen final candidate.

Private authority `0x384914dc7195b22ad348b57ea2a617e1e8e6b9f3` has eight configured arenas. Five actually opened epoch 1 on hosted Interlude. Three are unopened, not verified reserve. This is a fresh private season, never a replacement for public identities or ratings. Namespace `/opt/pongit/secrets/reusable-agents-20260928-1`; runtime `/opt/pongit/tests/fluid-20260928/runtime-1`; reports `/opt/pongit/tests/fluid-20260928/evidence-1`.

The first five arenas are `0x5d6524e0f513db9bb788c42af28012b077e143a2`, `0x9ecb6a0bdcebfc257a26d369f531de284ef43e07`, `0x5296ba8cac39f205da695b891bfea4dbd8c6da44`, `0x04356ae994b21b26b061db7919128814685ae564` and `0x64f61406243246b8b171f295151222a2c248c57d`. Engine, archive, reader and sponsor processes are bounded to about 04:59 UTC, with no restart. Admission and maintenance roles are not running. No new permanent controller was started. Each scoped signer received 5 test MON through the existing operator journal.

Four bounded controller trials completed at 02:10, 02:17, 02:23 and 02:30 UTC. Four, four, four and two real games respectively finished and were captured canonically: all eight house identities now qualified in both modes. Results include seventh-point wins, five-minute wins and ties. The first three trials used four simultaneous qualification matches. This is not yet proof of four human challenges plus a tournament, human parallel capacity, renewal or 24-hour availability. Reports are `five-controllers-1.json` through `five-controllers-4.json`; original deadlines remain preserved.

A first concurrency harness attempt failed because the test opened pool/tournament admissions but omitted the separate challenge gate. No human challenge was admitted. Its already admitted tournament fixture remains valid and is adopted explicitly by bounded attempt 2, not recreated. `pongit-five-concurrent-20260928-2` is the only current private driver. It retains separate owner/arcade journals, requests four instances of the tournament's official archetype, and must verify five actual playing snapshots before counting overlap. Inspect its original deadline and report before any other admission. Failed attempt 1 remains preserved.

Further fixes and checks:

- Removed a hidden three-day scheduler interval. The candidate now respects the tournament contract's one-minute `nextAt`.
- Closing admissions no longer closes read-only match/result routes, the existing observer or its notification connection. Signed admission checks remain separate.
- Closed predecessor metadata is verified against every migration authority and the unchanged ArcadeFamily.
- Seven stylesheet layers were consolidated in exact order, removing 266 overwritten declarations. Computed styles and geometry remained equal across 14 comparison pages. Court fitting runs before first paint; regional probes only run on the home page and cancel on navigation.
- Root TypeScript passes through run 15. Full TypeScript run 4: **737 passed**. Chrome/Edge build fixtures run 7: **54 checks passed**, including closed-admission observation, five widths/landscape, focus, results and replay. These remain synthetic state tests.
- An actual observer test initially failed because the build's CSP still named the old arenas. Build 9 uses explicit `PONG_AGENT_POOL_MANIFEST` and validates its exact origins. CSP is retained, not disabled. The API uses unchanged private JSON through a read-only SSH stdio bridge because SSH TCP forwarding is disabled. Engine HTTP/WebSocket go directly to the actual hosted nodes.
- One-minute real Classic render sample: 100% ball visibility, p95 frame 17.1 ms, longest hold 133.5 ms, processed clock 99.42% of wall time. Its script shutdown later threw an in-flight route disposal error; that attempt is not a clean whole-harness pass.
- One-minute real Chaos Edge sample: p95 frame 17.3 ms, longest hold 149.8 ms, but processed-clock endpoint ratio **96.65%**, failing the target. A subsequent 90-second Chrome Chaos sample passed its engine threshold at 98.11%, p95 17.3 ms and longest hold 283.3 ms; displayed clock was 97.90%. Keep the earlier failure. Clock progression needs further investigation and accurate time-aligned samples; these short windows do not prove sustained acceptance. Earlier late-joined samples measured a completed game and are insufficient active-game windows, not evidence of live engine freezes.

Backup `five-active-20260928T022228Z` includes the original operator database, exact candidate database and private runtime/keys/journals. Its three files are SHA-verified off VPS under `C:/Users/wwwle/.codex/private-backups/pongit/`. The exact candidate dump restored successfully into separate database `restore_five_20260928_0222` (seven agent_pool tables, eight health rows). No running database was replaced. Refresh backups again after subsequent writes.

Continue with actual five-lane results/latency, browser Mera controls, clock analysis, migration, reserve/rotation and the remaining gates above. Production, its old signer journal, unresolved historical incidents, balances and personal documents are untouched.

## Checkpoint — 28 September, 03:01 UTC

Five-concurrent attempt 3 completed at 02:45:25 UTC. VECTOR simultaneously occupied its competitive tournament and four independent human challenges in Classic/Chaos on five distinct arenas. Actual playing snapshots overlap for 35.423 seconds. Each synthetic human sent 100 confirmed direction changes; command p95 was 129.69, 156.19, 136.15 and 134.35 ms. All five results were captured from published commitments. The tournament finished 6–1 at its regulation limit; challenges finished 0–7, 0–7, 0–7 and 1–7. Pool, tournament and challenge gates were closed afterward. This establishes bounded five-lane operation, not seven simultaneous human/agent games, reserve or continuous availability.

Attempt 2 remains failed evidence: serial test-account preparation used up the first player's loading deadline. Its remaining matches finished naturally, and a separately journaled stop closed the gates. Attempt 3 prepares accounts before admission. No game rules or loading timeout were changed.

An exact canonical publication sample, blocks 66293785–66294084 (02:40:09–02:41:40 UTC), found 165 successful commits for these five apps, costing **403.92 test MON** over 91 seconds. Each transaction specified 24 million gas at 102 gwei. Largest calldata was 9,508 bytes. This includes the actual concurrency overlap followed by the remaining tournament; it is not a steady five-match hourly estimate. The report excludes other apps, reverts and PONGIT sponsorship. The 24-hour funding and publication policy still need qualification; reducing browser reads does not change these fees.

Actual Classic Chrome input test `browser-1b-chrome-0` passed using the real Mera implementation and a virtual PRF authenticator. It observed all countdown digits 3/2/1, 221 successful command receipts, F5 without another ceremony, 14.9 ms local movement p95 and 14.43 ms receipt p95. Initial private admission uses a harness invoking the same wallet/family/sponsor functions, because public release gates remain closed; this does not qualify the public catalogue journey or a physical passkey. Match 25 was subsequently published 0–7. Browser attempt 1 used an IP as WebAuthn RP and failed before any grant or challenge; preserved, then corrected to localhost.

Bounded `browser-seat-2` and its Edge Chaos browser are now running, with their original 20-minute deadline. No other fixture driver runs. Existing engine/archive/reader/sponsor roles still stop at approximately 04:59 UTC. All signed sponsorship goes to the private scoped sponsor; an SSH stdio bridge only forwards existing API requests without logging bodies. Production routing and SSH configuration are unchanged.

Classic Edge spectator sample `live-five-3-msedge-0` passed: p95 frame 17.2 ms, maximum hold 350.2 ms, processed ratio 98.233%, displayed ratio 98.543%. Its Chaos companion joined an ended match and failed for insufficient active frames. A new diagnostic timestamp now binds each clock value to its exact canvas draw, removing bias from repeatedly sampling an older DOM value. Tests reject reset clocks, insufficient active duration and actual display slowdown. The next live run must meet both engine and displayed 98–102% limits; the previous near-threshold failures are not reclassified.

## Checkpoint — 28 September, 03:55 UTC

Production remains unchanged. New source is still not frozen; no final soak has started.

### Gameplay and migration evidence

- Edge Chaos browser trial `browser-2-msedge-1` passed with actual Mera and a virtual PRF authenticator: local movement p95 15.7 ms, successful command receipts p95 14.70 ms, F5 without another ceremony, and a published 0–7 result (match 26). It retains the private admission-harness limitation of the Chrome trial.
- Spectator playout now initially fills its reserve and targets two normal deliveries, clipped to 300–1,000 ms. The previous 1.25-delivery margin exhausted during delayed packets. Fourteen focused tests pass. Actual Classic `live-rotation4-chrome-0` passes over 120 seconds: frame p95 17.1 ms, maximum hold 366.8 ms, engine/display ratios 98.969%/98.959%. Actual Chaos `live-rotation5-msedge-1` passes over 120 seconds: frame p95 17.3 ms, maximum hold 449.2 ms, engine/display ratios 98.568%/98.648%. Earlier holds above 500 ms, short terminal windows and test-configuration failures remain preserved. These are short desktop windows, not endurance or physical mobile qualification.
- Classic elimination tournament 1 completed all seven canonical fixtures at 03:41:15 UTC. Bounded attempt 2 adopted the already existing first two fixtures and verified them; it did not fabricate a new bracket. Both private admission gates closed afterward. Chaos elimination tournament 2 is now running alone in `pongit-five-tournament-20260928-2`, original deadline **04:42:36 UTC**. It optionally qualifies the newly registered community strategy on a fresh base. Do not start competing admission drivers or extend its deadline.
- The shipped contract strategy registered through the real community SDK at block 66301839: strategy `0x1637b2ab08426bdfd7b1e2b97fe54def6d0835fb`, creator `0xDc774DC7a67B55ca8953E5BDa687f0B7A6e1Ba52`. Both modes are requested, neither qualified yet. A cached funding transfer exposed a journal comparison bug: viem decodes empty calldata as absent. Normalizing that field to `0x` reconciles the same signed transfer, with the original nonce/hash and no second funding. Failed setup attempts remain separate.
- `PublicAgentMigrationForkTest` passed against canonical public block **66271018**, preserving all 9 identities, 162 ordered result entries and rating changes, 8 tournament histories, 7 challenges, qualification evidence, request counters and the existing family. Upstream reads are real; all deployments and gate changes occur on the local fork. Its seed-audit placeholder is explicitly not a release audit. Earlier test failures incorrectly called `entry(ordinal)` instead of `entry(matchId)`; the fixed test compares pages and real hashed match IDs.
- The current public tournament 9 is already in Playing with no bound fixtures (read at block 66303182). It started at 00:43:22 UTC. Its source identities remain reserved; the migration correctly refuses this unfinished bracket. It must finish legitimately before the final import. No public tournament state was edited.

### Rotation and operational evidence

`pongit-five-rotation-20260928-1` remains the sole lifecycle driver for the candidate. It opened spare arena `0x45bf6064d05ecb41a569e71f466b9cce117e9c4b` before closing used arena `0x5d6524e0f513db9bb788c42af28012b077e143a2` epoch 1. All six results were already published, the command journal had no pending entry and the epoch had 525 batches. Normal close used 230,137 gas. Actual release is due **04:03:51 UTC**, original overall deadline **04:18:24 UTC**. Other arenas continue playing. Release, finalized-root verification, epoch 2 and a subsequent game remain pending. No forced close or shortened hub window was used.

The shared indexer was at block 66307141 at 03:49 UTC. Its exact database dump and private Hasura recovery configuration are SHA-verified off VPS in `C:/Users/wwwle/.codex/private-backups/pongit/shared-replay-backup-20260928T0349Z`. An isolated clone restored 634 indexed matches, consistent metadata and the tracked GraphQL query using `ops/shared-replays.compose.yaml`. A private password rotation rejected the old credential from another container with PostgreSQL `28P01`; Compose recreation with the new credential returned the same 634 matches. The clone is stopped. Initial attempt 1 used loopback, whose PostgreSQL rule is trust, and is retained as a failed authentication test. Production credentials and Hasura are unchanged pending cutover.

### UI and cost findings

The expanded UI geometry test found clipped names specifically in short landscape Chaos. A second agent grid retained an avatar column after the shared compact header hid avatars. That override is removed. Chaos indicators now occupy a reserved side rail in short landscape, keeping the 16:9 field larger without page movement. Court fitting measures the actual rail width. Chrome and Edge run 14 pass the complete 54 fixture checks; a final rail label-layout refinement still needs its build check. Full TypeScript run 6 passes **742 tests**; root typecheck run 24 passes.

Canonical steady one-arena publication sample, blocks **66302751–66303050**, 03:26:12–03:27:43 UTC: **146 successful commits, 357.408 test MON over 91 seconds**, maximum calldata 2,884 bytes. Every transaction submitted 24 million gas at 102 gwei; the receipts charge that amount. This is a publication cost, not RPC request throttling. The inspected hosted CLI exposes app, region and name, not a publication gas/interval setting. No protected endpoint or provider configuration was changed.

At 03:42 UTC the shared publisher held approximately 25,859 MON. A linear projection of this measured cadence for five continuously active arenas is about **1.7 million test MON per day**, not a measured five-lane daily guarantee. A request for a 2-million-test-MON reserve is pending with the user; shared-account spending by other applications is separate. No transfer is automatic. Continue bounded work without draining the shared publisher; a 24-hour run is not funded by the current balance at this cadence.

The engine/archive/reader/sponsor roles still stop near 04:59 UTC. Admission and maintenance daemons are absent; only the named bounded drivers may create matches or rotate this private pool. Preserve the original operator database/journal/lock. Remaining gates include complete championships 3 and 4, community modes, worst-case hosted publication/release reserve, five agents alongside two humans, public catalogue admission latency, replay retention on current matches, candidate freeze and the unchanged 24-hour trial.

## Checkpoint — 28 September, 04:30 UTC

No production change, candidate freeze or final soak.

- The real normal rotation passed at **04:04:23 UTC**. Epoch 1 released in 1,488,386 gas at block 66310112 (`0x254574ae93563b46920e6b36204c745c51fdb54ea66a303698cc85b246110153`). Its six-result finalized root was unchanged. Epoch 2 opened at block 66310125 (`0x518e2f77f342409e4d8793d78b01d1d2b59330e458bdb52e7b2cfe7d4ce53976`); hosted chain, base, rules, runtime and publication checks passed. Actual match 36 then completed and was captured in this renewed epoch. This is one used-epoch cycle, not a worst-case reserve proof.
- A seventh owned private arena, `0xa4c880d75b2a1896ae56d1bb8e460ea18c07f917`, opened and passed its identity checks at 04:08:48 UTC, base 66310967. It provides a fresh base for the community strategy while tournament fixtures continue. No human arena or provider setting changed. The diagnostic admission bound remains unchanged.
- The private archive role exhausted its initial 5 MON at nonce 51. The signed transaction remained in the journal. A journaled **30 MON** refill from the existing operator restored service; the same hash `0x8ff37332230ff441177c01f4ac77f9dc0cc2c4891e05a0b56cb059dfdceb9823` confirmed without a new nonce. This was PONGIT role funding, separate from the larger shared publisher funding request. The original archive container is stopped; `pongit-five-archive-diagnostic-1` is its sole successor, retaining its state and original **04:59:10 UTC** deadline. Its temporary fetch diagnostic omits signed payloads and only records submission response status.
- Candidate code now distinguishes gas refusal from uncertain execution. `/healthz` reports process liveness separately from observed sponsorship availability. A real isolated PostgreSQL regression confirms that gas refusal preserves the signed nonce/hash and the identical operation succeeds after funding. The first new fixture run failed because its wallet chain verification tried an intentionally unreachable RPC; the corrected fixture serves chain identity on loopback and passes all six checks. No network transaction was sent by either database fixture.
- The maintenance review found that hub-active but unavailable engines could suppress opening an already released spare. Reserve counting now uses fresh hosted health and admission reserve. Budget exhaustion itself was already handled by an earlier lifecycle branch; that branch remains intact. Thirteen focused maintenance checks pass. The new maintenance source has not been substituted into an ongoing hosted trial.
- Chrome/Edge landscape run 16 passes, including visible regulation clock and unclipped effect names. Mobile run 17 passes touch actions and Chromium visual-viewport zoom at 2×, with the court returning to its original position and dimensions. These are browser simulations, not physical phones. Root typecheck run 29 passes; full TypeScript run 7 passes **745 tests**.
- Chaos elimination attempt 1 stopped with `challenge priority/qualification waiting`: the harness omitted the completed challenge-queue scan that the real keeper performs before qualification. Its failed report and closed gates are retained. Attempt 2 uses that contract scan and keeps the **original 04:42:36 UTC deadline**. It has verified fixtures 0–4, started fixture 5, and admitted community Classic match 38. Neither its completion nor community qualification is claimed yet.

Backup `after-rotation-20260928T0407Z` has three SHA-verified off-VPS files (operator database, candidate database, private runtime). Refresh after subsequent qualification/funding writes. No public contracts, identities, balances or previous incident records were replaced.
