# Reliable recovery and independent arenas

## Delivery status

The compatible recovery release is deployed. The existing shared application is running again in epoch 2. A real three-application hosted rehearsal also passed, including publication and independent closure. The website has **not** migrated to a shared Monad lobby with per-match physics contracts. Those are different delivery gates.

Production application: `0xfd1693294fed77304662f08e827b043b0ba386a3`, Monad Testnet 10143. Gameplay uses Interlude; no automatic Monad gameplay fallback was enabled. Existing financial manifests and Mera addresses are unchanged.

## Recovery completed

The expired epoch had a journaled tick at nonce 276 with no receipt. Its signed app, chain, signer, nonce and action were checked against the journal. Its terminal 2:7 score, winner and nonzero result hash matched between the engine and Monad; active count and pending diffs were zero.

The relayer fenced writes, retained the original bytes, quarantined that tick, re-simulated closure, and used its persistent operator transaction journal. It only made the tick obsolete after the hub released epoch 1. A missing receipt was never treated as proof of failure or permission to replace the nonce.

| Step | UTC on 11 September 2026 | Monad transaction |
|---|---|---|
| Close epoch 1 | 22:05 | `0x8536b031279b715ba0378caa020cff94ca1c9c814ca390d50f4fa48a90e339ae` |
| Release epoch 1 | 23:05 | `0x8788680ba489d46c19b4f2c8aca12db9f6c11cb8ab8c87e60308e3acfc14d613` |
| Open epoch 2 | 23:05 | `0x23fb8c648e057bdd9666dd34680661ebf55f952560acc7adeadb6e02a1671a47` |
| Legacy wallet payout, 0.008 MON | 23:05 | `0xc52169d1bef6cc09ad71bca2c322de85569190fad1ed0babf08d63af9e353ac6` |

Hosted renewal entered `playing` at 23:05:41 UTC after verifying the new epoch and reads. Subsequent real games published results. The payout receipt contains the matching beneficiary, payout ID and amount. See [onchain evidence](evidence/reliable-recovery/onchain.json).

The real hub challenge window was respected. The one-hour delay was not replaced by a cosmetic timer. The current shared deployment can still require a global drain at its next expiry; only the separate architecture will eliminate that dependency.

## Compatible changes

- Expiry stops admissions and game writes, but not receipt reconciliation, terminal observation, room repair or financial history auditing. Independent timers prevent historical or financial work from holding the Classic observer. A paused Chaos rally no longer sends idle VPS ticks; its resume tick is chained after the confirmed pressure submission.
- Hosted provisioning records intent, uncertainty, confirmation and intervention. Only an explicit non-creation response permits a fresh creation request. A stale engine epoch does not become healthy merely because the control plane says `live`; persistent ambiguity escalates after five minutes.
- The browser stores only scoped zero-value game command bytes with the limited arcade session. An uncertain submission blocks a different transaction, reconciles its receipt and epoch, and can resend only its original bytes. No wallet or notebook key is added to that journal.
- New arcade grants last two hours. F5 and transient network failure reuse a valid grant. A real expiry remains distinct from an unavailable game service. Existing shorter grants keep their signed expiry.
- Presentation identity no longer depends on command availability. A short outage preserves and blends the local paddle rather than resetting it to a stale confirmed position.
- Recovered command lanes retain their existing arena stream. A subscribed Chaos pause does not trigger repeated reads just because physics awaits a checkpoint. The ten-second consistency check remains; disconnection invalidates the cache, and a resume event is delivered immediately. Before a movement after a long cached pause, the command lane refreshes the engine head so its short block deadline is still valid.
- Chaos displays `Betting open`, `Closing bets` and `Preparing next rally` using the actual 40-block window and two confirmation blocks. It no longer plays a misleading three-second countdown over the entire process.
- Health separates process liveness, game admission and payment availability. Recovery stages and diagnostic identifiers remain observable without exposing signing material.

## Real independent-session rehearsal

At 23:33 to 23:34 UTC, three fresh, non-financial applications were tested on the real hosted service:

| Rehearsal | Application |
|---|---|
| Chaos | `0xc6afe5524ecad2e11a5082a2a5d850b8d8c9c773` |
| Classic | `0xbbf6a28b7f527f98cf1628949a83efe4d7bbf006` |
| Next Classic | `0xc93452a9d1da1db01e79d99f531a34104b76fe97` |

Two games ran simultaneously. After Chaos was conceded, its terminal hash appeared on Monad and only its delegation was closed. Classic accepted another command and its physics clock advanced while Chaos was exiting. The third game started during that challenge window. All three terminal hashes were published, all three sessions closed, and each subscription received real `applied` events.

[Full rehearsal evidence](evidence/reliable-recovery/independent-arenas.json) contains commands, hashes and assertions. This demonstrates hosted isolation, not a production migration, a complete paid Chaos game, or one-passkey authorization across those applications. The fixtures used distinct SDK grants and the existing coordinator ticket format.

Fixtures are released by the bounded `release-independent-rehearsal.ts` cleanup, using the same operator nonce lock and journal. It only accepts the successful three-app rehearsal, rejects the production app, waits for the actual hub deadline, and stops for inspection on a challenge. No production or financial delegation is retired by that helper.

## Validation and limits

| Validation | Result |
|---|---|
| TypeScript | 133 tests passed; type check passed |
| Contract regression | 204 tests passed across 18 suites; optional external fork suite excluded |
| Physics | 10,000 Classic and 10,000 Chaos comparisons, zero mismatches |
| PostgreSQL coordinator | Twenty duplicate-click cycles, room capacity, slow verification outside lobby lock, transient auth outage and expired terminal recovery passed |
| Chrome and Edge 152 | Revert, response lost after execution, response lost before execution, F5, ten-second 429, room rotation, final 7:6, exact ELO and next match without another passkey passed against the production frontend with mocked backend faults |
| Layout | 360, 390, 768 and 1440 px, including 768 landscape and overflow checks |
| Hosted independent sessions | Three real applications: concurrent games, publication, isolated closure and third admission passed |
| Real current-endpoint load | Not qualified: repeated HTTP 429 interrupted the test before 100 inputs per player |

[Chrome](evidence/reliable-recovery/chrome.json), [Edge](evidence/reliable-recovery/edge.json), [360 px](evidence/reliable-recovery/mobile-360.json), [landscape](evidence/reliable-recovery/landscape-768.json), [Classic physics](evidence/reliable-recovery/classic-physics.json), [Chaos physics](evidence/reliable-recovery/chaos-physics.json).

The real browser run after the stream-rebinding fix restored the session through F5 and recovered the result without a browser exception or observed input nonce gap. It still received twelve 429s across the measured pages. Several occurred during page setup, before the load loop. [Live events report](evidence/reliable-recovery/events-live.json).

The earlier polling trace recorded 78 browser calls plus 21 instrumented VPS calls in a fourteen-second window, a combined one-second peak of 17. Test-setup SDK traffic and other uninstrumented callers are excluded. This is neither a complete provider traffic count nor proof of a quota. [Baseline scope and counts](evidence/reliable-recovery/traffic-baseline.json).

No 80% read-reduction or 40% total-call-reduction result is claimed: the aborted runs are not comparable. The first private polling harness incorrectly marked its short run successful; that value is not accepted as a qualification result. The corrected harness requires the full input target and no rate-limit interruption.

The transport setting was enabled on the production VPS after real event delivery and recovery validation. A subsequent run with parallel page setup recorded 47 page RPC requests and five 429s; its full input target still did not pass. Both test matches were subsequently conceded with confirmed receipts. The different durations and setup prevent a quantitative comparison. [Post-deployment run](evidence/reliable-recovery/events-published.json).

The final isolated PostgreSQL regression also verifies that a missing Chaos checkpoint keeps observations running without idle engine writes. [Coordinator report](evidence/reliable-recovery/coordinator.json).

## Migration gates still open

1. Common Monad lobby, deterministic arena allocation and participation locks, separated from all delegated physics state.
2. Central ordered ELO/result journal with correction replay and player discovery; current rehearsal still uses local per-app ratings.
3. Family-scoped two-hour root authorization, per-arena epoch binding and separate future-admission/active-control revocation, validated with the real SDK.
4. Owner-claimed profile reservations and encrypted data migration. Existing candidate registries are not migrated by this release.
5. Per-match financial result freezing before arena reuse, paid Chaos rounds, post-payment correction audits and independent retry paths.
6. Real sustained multiplayer load, quantitative before/after transport comparison and the full user journey on the new architecture.

The old autonomous candidate still contains shared delegation and Monad fallback assumptions. It must not be activated unchanged. A successful capability rehearsal does not satisfy these gates. See [provider diagnostic](INTERLUDE_RATE_LIMIT_DIAGNOSTIC.md) for the remaining observed network failure.

## Operations and rollback

Private backups include databases, runtime configuration, operator journals and rehearsal recovery files. Backup `20260911T235117Z` was copied outside the VPS and checksums verified. Known unused PONGIT build images and caches were removed after inventory; disk use was 76% before the final build, with production, rollback images, volumes and unrelated projects preserved.

Keep the previous web image and the corrected recovery relayer. New journal fields are additive. Do not roll back to a relayer that sends quarantined bytes or stops result observation on expiry. Stop admissions if lifecycle state is ambiguous. Never delete an uncertain transaction, reset a nonce or reinterpret an old financial manifest to unblock deployment.

The stream transport remains a reversible deployment setting, `ROOMS_STATE_STREAM_ENABLED`. Disabling it retains journal, lifecycle, room recovery and presentation fixes. Preserve all application versions and their original financial endpoints when changing the transport.
