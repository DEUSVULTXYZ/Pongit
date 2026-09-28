# Fluid PONGIT candidate — 28 September 2026

Status: implementation and local validation. **No production changes, no hosted five-lane proof and no final 24-hour trial.**

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
