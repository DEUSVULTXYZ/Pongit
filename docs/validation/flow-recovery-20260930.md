# Flow and authorized tournament recovery — 30 September 2026

## Recovery authorization and canonical close

The user explicitly approved force-closing f202 epoch 1, recovering it and
retrying the cancelled tournament fixture. The unpublished 6–1 archive remains
intact; it is not a published victory and is not used to advance the bracket.

The fresh check at block 66992420 found the original epoch, batch 914 and
commitment count 2. The epoch had not expired. A force-close simulation succeeded
at 100,924 gas. The fixed-scope script uses the original `pong_relayer` database,
`il_lifecycle_jobs` and operator lock; it checks the exact arena, epoch, lane,
match and commitment before sending.

- Arena: `0xf202862714f61d6f6b8b14c1d2f5d3ca7ea3e41b`, epoch 1, match 190.
- Transaction: `0x27e3daf80f059116425459b98ca42ef5d2fd8a70b2e76d32bf733ffc91dc0835`.
- Confirmed block: **66994108**, 14:22:56 UTC.
- Earliest release: **15:22:54 UTC** (17:22:54 Paris).
- Existing maintenance and archive services own release, sealing, missing-result
  capture and tournament retry. No competing worker was started.

Two pre-execution harness failures (read-only container copy, then a TypeScript
assertion in JavaScript stdin) submitted no transaction and remain preserved.
At this checkpoint release has **not** happened yet. Tournament 11 is a Classic
championship with 4 of 28 fixtures resolved; fixture 4 references match 190.

## Compatible fixes

Published engine commit `9f4db4b` refreshes a lifecycle observation before a
command can outlive its three-second verification window. Concurrent callers
share the refresh. A transient failure retains the prior fence only until its
original expiry; a verified contradictory epoch, closure or base invalidates it
immediately. No authorization lifetime was extended.

Admission commits `6215575` and `1f04983` batch block-pinned hub observations,
prefetch independent authority checks, remove reads unused by the admission role
and put an eligible waiting challenge ahead of historical scans. The contract
still selects participants and arenas. New notifications deliver an account's
challenge without waiting for a slow catalogue. The browser preserves coalesced
topics and no longer restarts challenge polling for unrelated public changes.

- Engine image: `sha256:1ef50f896ed538ea6308d4cc8391d3128569264647d34509b4ef437c4a360a7f`, started 14:17:05 UTC.
- Admission image: `sha256:84be0566b809a0ba7c57789c5681e6b84232478b126468afdee6376bdb630fe2`, started 14:41:35 UTC.
- Reader image: `sha256:72e1dd3eb0e75901cca0197ea2a62f3dce36109287788f2adf2b6023fce928dc`, started 14:41:35 UTC.
- Candidate web image: `sha256:ec3bebb0e27f1f65a6e940aabd1fee93d90ce1754238f53bc2c1fe9455744b51`; not yet public at this checkpoint.

The human relayer and human contracts remain unchanged. No new game contract or
progressive policy was deployed. All current service journals are retained.
Temporary timing-only admission profiling is still enabled; remove the
`five-runtime/state/profile` flag and restart admission after measurements.

## Real public browser observations

These used real public services and a virtual Mera PRF authenticator, not a
physical passkey. Each complete run included 110 controls, F5, a spectator and
publication. The 8-second admission target remains unmet.

| Run | Mode/browser | Admission | Receipt p95 | Player max hold | Spectator max hold |
|---|---|---:|---:|---:|---:|
| Baseline match 208 | Chaos / Chrome | 60.292 s, first authorization included | 16.55 ms | 833.4 ms | 1049.8 ms |
| Fence match 209 | Chaos / Chrome, grant reused | 25.729 s | 16.52 ms | 399.9 ms | 466.3 ms |
| Admission match 210 | Classic / Edge, grant reused | 27.685 s | 16.31 ms | 400.1 ms | 483.6 ms |

Baseline 208 remains **failed**: the test tried to open Tools behind a natural
result window while the publication API was still catching up. Its natural 0–7
result was subsequently captured. The driver now checks the result dialog before
conceding and uses a bounded click timeout. Match 209 had one 51.7-unit snapshot
discontinuity in the player view; it is retained for investigation. Match 210
had none. Rendering p95 was approximately 17.1 ms. These short samples are not
proof of sustained availability or absence of desynchronization.

After the second admission patch, 44 idle service cycles had median **4,196 ms**,
maximum **6,483 ms**, versus roughly 7–9 seconds previously. This is service-cycle
timing, not a demonstrated player admission improvement.

793 TypeScript tests passed after the first admission patch; **795** plus root
typecheck passed after notifications. Secret scans and diff checks passed before
publishing both commits. A final public web/browser check remains pending.

## Difficulty migration preparation

The current ratings contract is itself a continuation. The original empty-seed
audit tool only recognized an original `sealMigration` deployment. A new
read-only audit checks the exact historical continuation runtime, its pinned
predecessor audit, code hash, seal, genesis, owner, imported count and canonical
receipts. The verified report is `ratings-continuation-20260930.json`, block
66997519. No ELO was written or reset.

The first audit correctly rejected the new candidate artifact as different from
the historical runtime. The second encountered an RPC failure; the third passed
with the actual historical artifact and paced reads. All attempts remain.
The source code difference is the later five-lane drain guard; the historical
seed methods remain unconditional reverts.

ProgressiveHousePolicies and RebalancedAgentCatalog still require a drained,
completed source tournament, closed admissions, verified migration and real
qualification. All eight bots, identity order, repeated-opponent state, pending
requests, family permissions and historical routes must survive. The current
source tournament must finish after recovery; it is not silently discarded.

## Funding, backups and rollback

At block 66989718, 14:00:44 UTC, the controlled operator held
626.042145356 MON and the shared publisher held 90,110.227981334931636726 MON.
No transfer was made. This funds bounded tests; it is not a guaranteed 24-hour
budget. Other applications also use the publisher.

Backups `flow-20260930T1415Z` and `flow-20260930T1437Z` are copied off VPS under
`C:/Users/wwwle/.codex/private-backups/pongit/`, with every SHA-256 verified. The
latter contains the confirmed close in the operator journal:

- agents.dump: `eee97cf20ce0b586f6628081d9e93314bfcbfb6647a3f1e25c4fc4fadbb4c470`
- operator.dump: `549023874fa241ed00620cbb79bae983d86b2204769f4b843ab5dfb5ec9371e7`
- runtime.tar.gz: `415b942cbe7ddd8959d193e00646af4f47b6310501600c1fe0b9f52fd25dd020`

Restore evidence from September 29 remains preserved; these new copies are not
claimed as a new restore test. Disk was 66%, about 23 GB free before builds.
Rollback changes one compatible image at a time, using the retained
`compose.json.before-*` files as references. Never overwrite newer journals or
databases. The authorized on-chain close cannot be rolled back.

Still open: canonical release/capture/retry, actual admission latency, remaining
player reconciliation, progressive policies and migration, extended difficulty
tests, final financial and replay checks, sustained concurrency and unchanged
24-hour qualification. Public status stays `qualified=false`.

## Update — 30 September, 15:22 UTC

The public web `1f04983` was deployed at 14:49:57 UTC. Public Edge checks passed
at 360, 390, 768 and 1440 px; the isolated actual-build UI fixtures passed 78
Chrome/Edge checks. These are UI proofs, not a continuous game qualification.

Admission/reader `677586b` deployed at 15:02:57 UTC. Background scans are now
bounded independently of player admission, and scoped sponsored transactions
prepare independent nonce/block/fee reads concurrently under the same journal.
The 246 measured service cycles had median 1,516.5 ms and maximum 4,956 ms.
This does not establish the eight-second player admission target.

The initial sponsor image failed an import check at runtime because its older
base lacked `agentServiceUnavailable`. It was rolled back at 15:03:37 UTC.
Commit `82cb306` includes the missing dependency and image import checks; the
corrected sponsor started at 15:05:33 UTC. Its failure log remains preserved.

Match 211 (`flow-final-20260930-chaos`) was actually Classic despite its requested
Chaos mode: an early button click happened before hydration. The original
functional report remains intact and is **not** Chaos evidence. A canonical mode
audit is stored in `flow-mode-audit-20260930.json`. The harness now waits for the
loaded catalogue, asserts the selected mode, and checks the contract mode after
admission and F5. Its actual Classic admission was 24.844 seconds; rendering and
short holds passed, but admission still failed the target.

Two subsequent real-public-browser runs failed before play:

- Match 212, 028f epoch 11, Classic: first publication failed with relay HTTP 401,
  `missing or wrong bearer token`, with zero committed batches.
- Match 213, 40178 epoch 12, actual Chaos: first publication failed with HTTP 429,
  `too many rejected tokens from you this hour`, with zero committed batches.

These are relay authentication failures, not measurements of an RPC quota or
proof of inadequate funding. No further game driver is running. Normal owner
closes of these **owned synthetic fixtures** preserve their journals and all
published state. They do not affect the protected real-user game 190:

- 212: `0xf181a816538519e2977b8914e14e346e6175fc684be367fadecc04b4745a1134`,
  block 67003549, release due 16:10:45 UTC.
- 213: `0x5033066c192785e8ddbda022ad0b6908deb540c5f1b7fbb6ec54790beea2f266`,
  block 67005568, release due 16:20:56 UTC.

The existing maintenance/archive services retain sole ownership of their
release, missing-result capture and renewal. Never resubmit these close scripts.

Commit `1a9f3c4` also fixes a PONGIT monitoring gap: idle nodes now recheck their
publication health periodically instead of remaining available indefinitely
based on their initial discovery. The relay's rejected-token limit has its own
allowlisted diagnostic reason. **798 TypeScript tests and root typecheck pass**.
Engine image `sha256:d38c8114e7bba53376408e10e57198cafcbffc7978f5fd6c8b2184d89b4abd41`
started at 15:22:15 UTC. Temporary admission profiling has been removed.
A healthy zero-batch response still does not prove the next publication will
work; pre-admission publication qualification remains a separate gap.

The 15:03 backup is SHA-verified off VPS. Both off-VPS database dumps were copied
back and restored into isolated scratch databases at 15:06:22 UTC. Eleven agent
tables and the exact confirmed f202 close journal were checked. Scratch databases
were removed; production databases were not restored or overwritten. This is a
restore proof, not an exact comparison against the subsequently changing live DB.

No difficulty-policy migration has been deployed. No unchanged 24-hour test has
passed. Final delivery remains incomplete.

## Canonical recovery complete — 30 September, 15:25 UTC

The existing maintenance service released f202 epoch 1 in transaction
`0x0f414c125ae5f8417655422f01fd2ad22602a6805be461dfa19d41f1940ef5d6`,
block 67005987, at 15:23:02 UTC. It reopened epoch 2 in
`0x512fce4c6ad7f2e04a7d27d2cb2f745f7a554b3256550c151f1499926a21fd0c`,
block 67006014, at 15:23:11 UTC.

The block-pinned audit confirms the exact finalized epoch-1 root
`0x95f4875acf696d6f3fc736a9c55f7f3b218feafc3373b4925e1c4f5d4c941a70`,
count 2. Match 190 is a final cancellation (status 4, zero scores, zero winner),
not the unpublished archived 6–1 victory. The archive is preserved.
`retryCancelled` confirmed in
`0x3a8dec589daa5148a9fb1d1da3c76d2ea218437d18a24dc302d577d8748a0b9b`,
block 67006358, at 15:24:54 UTC. The audit at 15:25 confirms attempt > 1.

The retry became match 214 on 76ca epoch 12. **It failed its first publication**
with `429 Too Many Requests: too many rejected tokens from you this hour`.
It is not a completed tournament fixture. Do not close this retry implicitly:
its original ticket, pending commands and public archive remain under the normal
recovery rules. The user authorized the prior f202 recovery, not an unlimited
series of forced cancellations of real-user/community matches.

### Rejected publication-probe experiment

Commits `da2f925` and `0b0846c` added a bounded, journaled getter probe using the
existing engine signer and lock. The complete TypeScript suite passed **801**
tests; the corrected empty-header guard passed its 24 transport tests and root
typecheck. The initial guard correctly refused to sign because it confused the
cleared physical header (0,0) with the separate new commitment epoch; this was
corrected against actual canonical and hosted reads.

The real probe on f202 epoch 2 executed once with nonce 0 and hash
`0xf86abe77b0cfeb5f0b50b93c3b8a7719a5b8eb761e11bef0284b4c1607a09106`.
It is durably observed in `agent_pool.engine_jobs`. It changed no game state.
The hosted node still reported zero pending diffs and zero committed batches.
**A getter cannot qualify the publication relay.** No player was admitted by
this probe and its receipt is not a publication proof.

The experiment was rolled back to the validated idle-health engine image
`sha256:d38c8114e7bba53376408e10e57198cafcbffc7978f5fd6c8b2184d89b4abd41`.
Source retains the experiment only behind
`PONG_AGENT_PUBLICATION_PROBE=qualification-only`, absent in production.
It must not be enabled publicly: with no state diff it waits indefinitely for a
batch that it cannot cause. A future real probe needs an epoch-bound state
transition or a bounded private qualification, and actual canonical publication.

The current hosted-creation request sends only application and region. No PONGIT
bearer token is passed to the hosted node's internal commit relay. Its 401/429
responses are distinct from browser RPC throttling and from funding. No provider
configuration was changed or credentials guessed. Healthy existing epochs and
the human deployment were not closed to work around this failure.

Backup `flow-20260930T1524Z` includes recovery journals and current runtime,
with three SHA-256 matches on the off-VPS copy:

- agents.dump: `bdb44dce27830e9c6338b9078eac400cbef4584473a5b449aa9aa60fbb336818`
- operator.dump: `27a20508de8af1acbbdee3028a121d51fe966ef7abfed36583c034359f4169d2`
- runtime.tar.gz: `d7877a58d94c4ac38e59a9c225de481b9013429ed8384d5f1695db1f57605c6e`

Pending scheduled recoveries remain 212 at 16:10:45 UTC and 213 at 16:20:56 UTC.
Existing services own them. No additional close, game fixture, provider change,
fund transfer or nonce writer is authorized by this note.

## Final checkpoint — 30 September, 15:41 UTC

The final post-experiment backup `flow-probe-final-20260930` is copied off VPS;
all three SHA-256 hashes match:

- agents.dump: `4ea5923322a3ce04657fce828f9309f6ce1ad7cbd8bfb60d88b51c5a0e929b01`
- operator.dump: `ffda9247d7fcff7f649e6ab5535ffb0f268b2678f46011191297b11ac3877193`
- runtime.tar.gz: `d42dcbf4979609b01d377dfcd1ea8826f8da229c3ef8c21ed92194c47d986b96`

The validated engine restarted at 15:37:09 UTC; human relayer image and its
September 24 startup timestamp are unchanged. No fixture driver remains active.
The follow-up retains the two bounded fixture-release checks before pausing on
an unresolved external publication-authentication blocker. Current monetary
reserve is not the cause of these exact authentication refusals.

## Scheduled recovery — 30 September, 16:19 UTC

The existing maintenance service released 028f epoch 11 at 16:10:50 UTC, block
67015484, in `0x3102646cf6255a22d2d3bb922051b08a1af06b0dae361000024a87038084278b`.
It opened epoch 12 at 16:11:00 UTC, block 67015514, in
`0xf7afebfe676f8cc70716ab6892f2009d325eb27192fc11f13abd2839d8af5b5e`.
The block-pinned audit at block 67016723 confirms match 212 is captured as a
final cancellation, zero scores and no winner, with the exact expected empty
root and zero results. The failed browser report remains failed. A reopened
delegation is not proof that its hosted publication works.

Match 213 was still closing at that observation; its actual deadline remains
16:20:56 UTC. No replacement writer or recovery transaction was submitted by
this follow-up. The existing scoped maintenance/archive services own completion.

## Relay recovery and application defect — 30 September, 16:30 UTC

The scheduled audit at 16:21 confirms both owned fixtures 212 and 213 are
captured as final cancellations with the exact empty roots. Both arenas have
advanced to their next epochs. Their failed browser trials remain failed.

The relay recovered without a PONGIT session restart or credentials change.
At block 67017549, 76ca epoch 12 has one canonical batch and match 214's admitted
state is published. Matching hosted health reports healthy. This establishes
recovery for this epoch; it is not a blanket qualification of all fresh sessions.

The tournament did not resume because PONGIT had marked its `start` command
permanently refused after the node said its session was over. The exact job is
`match:214:start`, nonce 2, hash
`0x4f57c4df3640055a25e6d28be9df96fd01ea4b3f03fb7978f14ccf9ae3b13146`.
The old transport subsequently threw `Arena operation is refused; refresh its
state` on every retry. This is an application recovery defect, independent of
the earlier relay authentication incident.

The compatible fix keeps new reusable-arena halt refusals pending. Historical
halt refusals can resume only their original signed bytes, after matching healthy
publication evidence, a valid lifecycle fence, exclusion of competing journal
entries, and either their exact receipt or equal pending/latest nonce. The old
refusal is retained in the resolution history. Gas-cap refusals and closed epochs
cannot use this path. No replacement transaction or new signer is introduced.

Regression tests reproduce the original failure, then verify recovery, missing
responses, restart, wrong epochs/applications, unavailable health, conflicting
commands, consumed nonces and gas refusals. All **809 TypeScript tests** and root
typecheck pass. Production deployment and the actual match-214 result must still
be checked separately; no new game driver has been started.

## Actual recovered result and remaining latency — 30 September, 16:42 UTC

Engine `c04443e` deployed at 16:29:03 UTC as
`sha256:09fd1103a16e69ecf40b353708cc0a82afe0152c448bdb34c844aa3b4daea6cf`.
The exact original nonce-2 start was observed at 16:29:11; its old refusal proof
remains in the journal. No replacement bytes were signed. The canonical match
214 result is **7–0**, elapsed 297.135317 seconds, captured with its tournament
fixture resolved. It remains contestable (`finality=false`). Tournament 11 has
resumed. Proofs, including the exact receipt, are in `flow-recovered-20260930.json`.

Both scheduled fixture recoveries are complete. 40178 was released at 16:21:04
UTC in `0xf1d1ee3a9d533786896a199d1c4a8ed28eaffd4f848ed76b17e468028422b3f7`
and reopened at 16:21:11 in
`0x2858dbf51d22b66929a76849b67368c019c3cab3d813b96163128b255debc617`.

A real public Chrome spectator measured 60 seconds of match 214: 100% ball
visibility, 97.69% moving frames, 17.1 ms frame p95, engine clock 99.20% and
displayed clock 99.36% of wall time. **The test failed** on a 966.7 ms hold;
the accepted maximum remains 500 ms. No page errors or slow browser HTTP
requests explain that hold. The engine journal separately records 1,246 and
1,201 ms gaps between commands near that window, although their own execution
round trips were 117 and 112 ms. This is not a passing fluidity qualification.

The next compatible optimization removes a serial header verification RPC by
using an exact block hash with `requireCanonical:true`. There is no fallback to
latest. A real probe through the production RPC proxy decoded all eight arenas;
three two-call observations took 556, 934 and 370 ms. The proxy rejected an
unknown block hash between two successful reads of the known hash. Unit tests
retain the three-second fence, reorganization refusal and per-arena isolation.
Immutable arena code is now verified once per epoch/base instead of repeatedly
while hosted discovery is unavailable. Public rendering must be remeasured after
deployment. All 809 TypeScript tests and root typecheck pass on this candidate.

The final recovery backup `flow-recovered-20260930T1640Z` is SHA-verified off VPS:

- agents.dump: `9eb67672af3381976fdc762da48b88db07a1e406f3cc9644542f0d07e55d5d6a`
- operator.dump: `66706039cf1d245b73088441a128c95d0e107e0304731f509e93130a861ffd90`
- runtime.tar.gz: `17411d1d9c4fd7f6c74bf8acc985fc33be8fa355920da88227b7b1a962b55341`

No human service or contract was changed. The difficulty migration, admission
target, financial/replay checks and unchanged 24-hour qualification remain open.

## Reduced reads deployed and measured — 30 September, 16:54 UTC

Engine source `01d3a06` deployed at 16:43:57 UTC as
`sha256:b4fb3eb64354d52e139027ea5653e5936d4728793c6b754e4586ab12d31c02a9`.
It retains the exact-command recovery in `c04443e`, the sole arena writer and
the same three-second authorization fence. The getter publication experiment
remains disabled. Roll back only the engine image to `09fd1103…ea6cf` if needed;
never restore an old operation database.

At stable one-minute controller observations, canonical header reads fell from
104 in the earlier sample to 69–70. Bytecode reads fell from 43 to zero in two
stable minutes (two reads when a new match required its pinned strategy code).
These are role-specific samples, not a total-RPC or five-lane qualification.
The current tick cadence is unchanged. Engine submission p95 was 100 ms in
three sampled active minutes.

Two attempts joined matches 216 and 217 too late to obtain the required full
active window. Both Chrome and Edge reports remain failed/non-qualifying;
their long terminal holds are not an active-rally freeze measurement. No prior
report or acceptance threshold was changed.

A subsequent complete 60-second window on actual public Classic match 218
passed in Chrome and Edge: 100% ball visibility, 99.44% moving frames, 17.1 ms
frame p95, maximum active hold 116.8 ms, no stalled clock samples. Engine clock
progression was 99.51% / 99.43%; displayed progression 100.17% / 100.19%.
This is a short read-only desktop proof, not evidence for all games or 24 hours.
Raw report paths, hashes and method metrics are preserved in
`flow-sync-20260930.json`.

The next bounded public catalogue test uses a virtual Mera authenticator and
actual Chaos mode, controls, F5, a separate spectator and canonical result.
No competing engine or lifecycle writer is started.

## Player and admission measurements — 30 September, 17:04 UTC

The first restored virtual authenticator could not provide PRF after import;
its screenshot says `This passkey provider does not support PRF`. No sponsored
transaction or game was created. The original three-minute failed report is
preserved. This does not qualify physical passkey renewal.

A newly created virtual Mera account completed actual public Chaos match 220
on a5f7 epoch 12; then its still-valid grant completed public Classic match 221
on f202 epoch 2 in Edge. Both verified their actual selected mode, at least 100
executed input receipts, F5 without a fresh assertion, and published 0–7 results.
These synthetic controls are not evidence of bot win rates or human difficulty.

- Chaos: local input p95 15.2 ms, executed receipt p95 15.8 ms, player/spectator
  holds 183.3 / 183.4 ms. No snapshot jumps or frame gaps were detected.
- Classic: local input p95 15.9 ms, executed receipt p95 15.5 ms, holds
  100.1 / 216.8 ms. No snapshot jumps or frame gaps were detected.
- Both render p95 values were 17.1 ms. These are bounded windows with an actual
  concurrent tournament, not proof of all lanes or the unchanged 24-hour trial.
- Admission remains **FAIL**: 29.137 seconds including initial connection and
  21.896 seconds with an already valid session. The target remains eight seconds.
  A `passed` field in these functional reports does not override their explicit
  `performance.admission=false`. The aggregate evidence distinguishes the two.

The API still serialized request, participation, lane and challenge-reference
reads. The next read-only patch overlaps independent reads at the same pinned
block and retains all reference/owner/agent/reorganization checks. The request
cache now lasts 250 ms, while the catalogue retains its two-second cache.
Slow in-flight reads still coalesce and cannot create duplicate network work.
Focused regressions verify both early refresh and refusal of a mismatched
challenge before an arena reference can be returned. This API patch is not yet
deployed at this checkpoint.

The engine/runtime backup `flow-pinned-20260930T1656Z` is SHA-verified off VPS:

- agents.dump: `b059bd70bc8dbb66b332a71c8d0f2c265e8a885975aaa1226281084ea252f887`
- operator.dump: `852587386fc1a029ee647868562b8bec1875cdfd1461077f96f4fe9180b1866e`
- runtime.tar.gz: `5581706b93b87c29102d1e88ed3967cc988512b5f0f6b387f7f2d01c9f84cfae`

It includes the deployed `01d3a06` engine but predates player trials 220/221.
Refresh the journals and runtime after the final compatible API deployment.

## Admission path correction — 30 September, 17:22 UTC

Reader `7b93abd` deployed at 17:12:29 UTC. Offline imports and exact source
hashes passed. The engine and human relayer were not restarted. Its real public
Classic match 224 completed and published 1–7, but the strict test remains failed:
admission 29.415 seconds and local input p95 59.1 ms exceed their targets. Executed
receipt p95 was 15.73 ms; player/spectator holds were 67 / 83.1 ms, frame p95
17.1 ms, without snapshot jumps or frame gaps. The read patch alone therefore
does not establish an admission improvement.

Canonical transaction decoding found 9b8 epoch 11 disabled and re-enabled by two
successive gate updates before the challenge. The next candidate defers only an
optional enable when a waiting challenge can already use an enabled, freshly
verified idle arena. Any exclusion remains mandatory before admission. Initial
capacity and ordinary reserve maintenance are unchanged. A focused regression
covers exclusions, mixed batches, unavailable capacity and idle maintenance.

The same candidate removes a duplicate capacity request from a valid-session
click, overlaps the independent session check, and batches independent engine
admission evidence. All identity, code, epoch, grant and ticket checks still
complete before signing. No command permissions or nonce ownership change.
Root TypeScript and 812 TypeScript tests pass. The build and actual browser
qualification of this candidate are still pending at this checkpoint.
