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

## Hourly publication gas budget — 30 September, 17:28 UTC

A different relay failure now pauses tournament match 226 on f202 epoch 2:
`batch 190` was refused with HTTP 429 and `the control plane has spent its gas
budget for this hour. try again later`. The matching node reports 189 committed
batches and nine pending diffs. Preserve this tournament and its exact pending
commands; no force-close is authorized by this incident.

Evidence in `flow-publication-gas-20260930.json` includes the observed endpoint,
UTC time and Fly response identifier. The shared publisher still held about
90,006 test MON at the separately queried latest block. This is not proof of
wallet insolvency, an RPC requests-per-second quota, or a need to transfer money.
The reported relative `retryAfterMs` is embedded in the existing halt and must
not restart a countdown every time health is read. Normal matching-epoch health
must confirm resumption. No new game fixture is started during the failure.

Source diagnostics now distinguish `hourly_publication_gas_budget` from hourly
commit count, rejected relay tokens, generic publication throttling and an
unfunded publisher. Thirteen targeted tests and root typecheck pass; raw relay
contents remain excluded from public errors. This diagnostic source has not yet
replaced the deployed engine at this checkpoint.

Admission/engine `a11abf6` were deployed at 17:25:52 UTC with exact source hashes:

- admission image: `sha256:b286700b3b198357b1edeceffdf313c6aba3ce52a6667a53323542871ce16208`
- engine image: `sha256:578009bed854b28b347b9c46ca35d604b95dc497a7c579723758c9b31a66d1e7`
- web candidate image: `sha256:ccba719c14b23a57e8f7540978a8d67e428056cb2ccadc9feb802bbb8b8b422f`, built but not public.

The pre-deployment backup `flow-admission-20260930T1725Z` is SHA-verified off VPS:

- agents.dump: `22ac8950061d7445a31ca7374e7807081a8004b423c5d8c57500730376362ddf`
- operator.dump: `63599e01724796cd1b74448791c912cfbd0984cf08e3c4e2b410f0b722a600df`
- runtime.tar.gz: `09077caa240effb41f009ffbade1c172e664837678878fb32dd1967b36ba003c`

The first isolated UI attempt failed because SSH port forwarding is prohibited,
not because the private image was down. Both failed reports are retained. The
same image's HTML/assets were captured through the authorized file/SSH path for
browser fixtures; this does not qualify a real player admission.

## Public rollout and strict failures — 30 September, 17:53 UTC

The hourly publication gas-budget incident recovered at 17:33:41 without a
provider restart or transfer. Match 226 on f202 epoch 2 published 4–3; its
captured hash is `0x2ec84227de17cb20a2c08b7c8c0dd599a4413411939ff2110077f12456128f1c`.
Tournament 11 had 14/28 fixtures resolved at 17:34. Publication recovery does not
establish that this relay budget is sufficient for sustained traffic.

Public web `a11abf6` and engine diagnostics `fb31e64` deployed at 17:35:27.
The candidate UI passed 39 fixture checks per browser (78 total), including four
widths, landscape, reduced motion and zoom. The first forwarding-denied attempt
and the second attempt against a private build with public gates disabled remain
failed. The successful third attempt used the actual enabled image's captured
HTML/assets with synthetic API/engine fixtures. Public Chrome then verified four
widths, pixel header and selectors, 44-pixel controls, decoded avatars and no
overflow. This is distinct from real game evidence and physical-device testing.

Additional public games used virtual Mera, actual contracts and engine, 110
controls, F5, a spectator, and an ordinary-rally window before result recovery:

| Match | Mode | Admission | Local input p95 | Executed receipt p95 | Maximum player / spectator hold | Verdict |
|---|---|---:|---:|---:|---:|---|
| 229, 76ca/12 | Chaos | 21.958 s | 15.9 ms | 15.67 ms | 116.5 / 133.5 ms | Admission FAIL |
| 231, f202/2 | Classic | 18.712 s | 15.5 ms | 15.16 ms | 30,017 / 30,417 ms | Admission and flow FAIL |

Both published 0–7. Reports and exact hashes are summarized in
`flow-admission-20260930.json`. Their failed overall verdicts are retained.
An earlier match 224 also failed local input (59.1 ms); the 108-unit prediction
bound is a lead, not a proven fix. Do not remove this bound to hide divergence.

Admission profiling shows ordinary iterations around one second, but occasional
expiry/qualification scans add seconds. The actual admission step for match 231
took 4.631 seconds, including 1.262 seconds before transaction preparation. Two
later successful `admitChallenge` transactions emitted no assignment and scanned
the old queue. They did not create duplicate games. Profiling was removed and
admission restarted at 17:49:35. The observations do not pass the eight-second
target and do not authorize changing that target.

## Publication observation fix — 30 September, 17:53 UTC

During match 231, the engine entered `publication-paused` at 17:44:44.493 and
returned to playing at 17:45:14.810. The old loop slept for its generic 30-second
write hold before checking health. We did not observe exactly when the remote
node recovered, so cannot attribute the entire freeze to local delay.

Published `4b5405a` makes recovery health observations every two seconds while
publication is paused. Fresh matching application, chain and epoch evidence may
clear the publication-only transport hold; a health request begun before a
newer failure cannot clear that failure. Actual HTTP Retry-After still applies
to all requests. Boolean halts cannot look healthy. Exact pending commands still
pass the existing nonce, receipt and journal reconciliation before resubmission.
No command is sent merely because health recovered.

817 TypeScript tests and root typecheck pass, including 72 focused recovery,
transport, journal and halt checks. Secret and diff checks passed before publish.
The backend image passed isolated imports and was deployed at 17:51:56.288 UTC:
`sha256:bffae7d6c4d1f3bf9ebb10f450a62bfd5a8b82eba676e1b0faca6fcc5416a0ba`.
Only engines changed; the human relayer still has its September 24 start time.
The former engine `sha256:427165650cec56e2463c5e5a4b0d112eda8b5b73a0a92caf779d254d8b5936a6`
and `compose.json.before-recovery-4b5405a` remain for service rollback. Never roll
back databases or signed journals.

At 17:52 all observed agent epochs were healthy or normally closing. One actual
post-deployment browser fixture is running: `health-valid-20260930-chaos`, match
233 on 9b8 epoch 11. Do not duplicate it or claim it passed before its report.
No funding request or provider change is needed at this checkpoint. Admission,
difficulty migration, sustained publication, finances, concurrency and unchanged
24-hour qualification remain open.

Pre-deployment backup `flow-health-20260930T1750Z` is SHA-verified off VPS:

- agents.dump: `e04d458d97c700e8b978267358de897da69b2ed593d2461301daa1f10fa92727`
- operator.dump: `0f2a4a5fc5cdbc728298565d03604eb82f562456d40d7ad9911643488ffff097`
- runtime.tar.gz: `687e13ec56fc1194586972ae66d12da282eb84200a832bf3e373e273a6532762`

These are fresh copies, not an additional restore trial. The earlier actual
scratch restore remains separately recorded. Disk usage is 69% (22 GB free).

## Strict results and atomic-admission candidate — 30 September, 18:20 UTC

Match 233 has finished: Chaos 0–7, canonical captured hash
`0xd5245a7dccc1c20a45413927779070aa69e284454a0293f2c6e5f3015cc66778`.
Its overall verdict remains FAIL: admission 21.323 s and maximum holds
5.550 / 5.667 s. Local input p95 was 15.8 ms, executed receipts 18.45 ms,
render p95 17.1 ms, no recorded snapshot jumps. The recovery patch reduces
local observation delay but does not remove upstream publication outages.

The 90-second read-only publication watch at 17:56 had 225 observations,
nine unhealthy and no unknown. 76ca/12 batch 343 was refused for the relay's
hourly gas budget, then recovered at 17:56:35.711. This is not an RPC quota
or proof of wallet insolvency. Source `63be738` now records allowlisted first
refusal details; engine image
`sha256:e1ce8273387b3e316b8b84a579e62ed4628f7638187eba6babbf27d87f3a3055`
started at 17:59:07.789. No game driver remains from these completed trials.

Candidate `0083c13` batches the unchanged signed challenge with optional
permissionless `admitChallenge`. The contract still selects the arena/player.
No capacity means the original request stays queued. The sponsor accepts only
these two exact targets/selectors, zero value, canonical bytes and a signed
request; no arbitrary/nested multicall, cancellation batch or financial method.
Its startup verifies Multicall3 runtime hash
`0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891`.
The gas estimate requires the optional admission to succeed when possible;
only a decoded contract revert allows estimation of the queued-only path.
The strict estimation bytes are never signed/stored. Lost responses retain the
original operation, including after disabling the browser rollout capability.

A read-only actual-chain simulation at block 67038599 assigned an arena using
both calls. Strict estimate 2,198,308 gas; best-effort estimate 2,179,995 gas.
No transaction was sent by that probe. This is not a real admission latency
proof. The public client capability remains absent pending actual qualification.
821 TypeScript tests and root typecheck passed; source/diff/secret audit passed.
Sponsor image `sha256:7b04c4a40f5284f08feea3d2ae77f28f9687c74915c0a69e58081396a4b0b49b`
started 18:16:17.164, its health confirms sponsorship available. Web candidate
is building; no owned game fixture has started at this checkpoint.

Backup `flow-atomic-20260930T1814Z` is SHA-verified off VPS:

- agents.dump: `e1798f25ff09efe25b2a250054ea585c44de8a310361ded0b58d82eaeb846747`
- operator.dump: `732c1b66ada186bc30ecff0b47524cb20432cd756e4c21097447cbb282cf5c42`
- runtime.tar.gz: `a689abe25b05ac728e1bcdcaf13477e004e0488b394e2d80c2362012c2ac7e2f`

It precedes the sponsor switch. Rollback: disable the atomic client capability
first; keep the new sponsor until all accepted batched operations reconcile.
The old sponsor cannot replay a queued multicall. Never restore an earlier
nonce journal/database to roll back a service. Human backend remains unchanged.

## Atomic admission actual test — 30 September, 18:30 UTC

Web `0083c13` image
`sha256:7a7f4744e9fbaaf3b5a4b113766c2dc9f708542bdd9753e7733ea511a6695aaf`
started 18:21:20.823 UTC. The public manifest still does not enable
`challengeAdmission`. Only the bounded virtual-Mera Chrome fixture overrode
that capability. All its sponsorship/Monad/Interlude traffic was real. Public
Edge read-only checks passed at 360/390/768/1440: pixel header/selectors, 44-pixel
controls, decoded portraits, no overflow, main pages 200. Mobile capture was
also visually inspected. The human backend and its main web remain unchanged.

Fixture 239, 76ca epoch 12, Chaos: **FAIL**. One canonical Monad transaction
created request 48 and assigned that exact player to lane 1 (proof in
`flow-atomic-admission-20260930.json`). Gas used 2,685,504; paid at 102 gwei.
No second operator admission was needed for this request. Actual admission was
17.093 seconds, still above 8 seconds. Input p95 15.4 ms, executed receipt p95
14.73 ms, render p95 17.2 ms. F5 preserved the grant. An ordinary-rally window
then recorded a **42.267-second hold**. This run had no spectator probe and
therefore cannot qualify spectator performance; the next harness now refuses
a strict full-performance run unless both probes are configured at startup.

The fixture ended at its original deadline, reporting no published result.
Its browser is stopped; the game and its pending journals remain owned by
normal services. At VPS 18:29:17 UTC, the matching node still reports 400
committed batches, nine pending diffs, and the relay's hourly gas-budget
refusal. The public result is absent. Do not create another fixture or
implicitly force-close this game/community tournament while that halt persists.
Tournament 11 had 23/28 fixtures resolved, with 240 active.

This does not complete atomic public rollout, fluidity, difficulty migration
or 24-hour qualification. Additional admission cost is measured in the
pre-existing-request API read (1.79 s), sponsor intake (2.85 s), and delayed
request/arena navigation. A possible next narrow optimization is to use the
existing canonical `pending(player)` read and exact confirmed receipt before
waiting for a repeated API snapshot; it has NOT been implemented.

A clock comparison found VPS ahead of the local browser host by approximately
5.76 s with 1.755 s SSH round trip. Cross-host UTC timelines must not be treated
as precise latency measurements. Browser durations and the reported input,
render and admission thresholds use the same browser clock. No host clock was
changed. Gateway health separately showed queued Monad reads and throttling;
that is distinct from the Interlude publication budget. No funding request.

Final runtime/journal backup `flow-atomic-final-20260930T1831Z` is SHA-verified
off VPS (not a new restore trial):

- agents.dump: `ba3717925db2da4f8c4253b622359a6c8d5a08dd1ae26465716081d3e64b37ab`
- operator.dump: `02cd58f22ee0dc614ebc74b8bc6ed792fb5f5af0677b1e4644af5f1483934600`
- runtime.tar.gz: `4e127ad0fd9ee4be25f6e9314a62b5c1ae19938a667a45ffdf22e1573c6126c4`

No owned driver, manual lifecycle writer or temporary UI server is running.
The ordinary services retain match 239; preserve its failed report and wait
for an actual published result before claiming later recovery. The current
SDK documents a node commit interval and a manual commit method, but PONGIT's
production code does not call `interlude_commit`. The local-node CLI option
is not proof that the hosted API accepts a commit-interval override. No provider
configuration was changed or guessed.

## Canonical recovery and receipt shortcut — 30 September, 18:43 UTC

The normal services recovered fixture 239 after publication resumed. At canonical
Monad block 67044225, its result is captured, status 3, score 0–7, hash
`0xd9fb79a79bd43228a48853d19463411106522074171aca4165122feba3d3c5f9`.
This later recovery does not change the failed browser trial or its original
deadline. Full reference and canonical block hashes are preserved separately in
`flow-atomic-recovery-239-20260930.json`. No force-close, replacement transaction
or new game driver was used. Tournament 11 had reached 24/28 by 18:34 UTC.

A further browser candidate avoids the full challenge/arena health API read
when the queue contract reports no pending request. After atomic sponsorship,
it can navigate from the actual canonical admission receipt. It validates the
queue and pool emitters, accepted player/agent, mode, rules, known arena, epoch
and full reference. An admission for an older queued player, missing receipt,
reorganisation or optional admission failure falls back to normal observation;
it never causes a replacement signed request. The arena still checks current
admission and authorization before play. This shortcut is not yet deployed,
and the public atomic capability remains absent.

The decoder also passed a read-only check against transaction
`0xde125d7a07d214e97fabf82ac14f0e4f6fd1db4c73c820f7094380d229f079b3`,
resolving exactly 76ca/12/239. That proves receipt interpretation, not the latency
of a new browser admission. Eighteen focused checks pass, including queued older
players, foreign emitters, wrong mode/epoch/rules, duplicate events, lost reads
and reorganisation. The first test fixture encoded an indexed event incorrectly;
its failed log is retained and the corrected fixture passes. No contract rule,
sponsor authority, nonce ownership or human deployment changed.

Full suite: 824 TypeScript tests and root typecheck pass. Public atomic rollout remains disabled until a new real browser trial meets its gates.

## Actual public replay and remaining pixel controls — 30 September, 18:52 UTC

The latest three resolved tournament games (240, 241, 242) have public replay
frames, with 343, 1,871 and 2,007 frames respectively. API reads returned 200.
Match 242 (f202/2, 4–3) passed actual public playback on Chrome and Edge at 360
and 1440 pixels: animation advances, seeking reaches the final score, body
scroll is locked, Escape closes the window, and focus returns to its button.
No engine request, passkey or write was made. This is retained-history playback,
not another hosted match or a physical-device test.

Visual review exposed a real styling omission: portal-based replay controls
still inherited the older rounded theme. The new strict pixel check correctly
fails on the current public build. A scoped replay CSS correction reuses the
Pixel Palace frame, square bevelled buttons and a square cyan range thumb,
keeping 44-pixel controls and keyboard focus. It does not modify human gameplay
or global control rules. Candidate browser validation is still required.

## Real match and queue traversal diagnosis � 30 September, 19:14 UTC

Public web f058201 deployed at 18:58:55 UTC after 78 Chrome/Edge fixture checks.
The public replay 242 passes actual playback, seeking, focus and pixel-control
checks at 360 and 1440 on both browsers. Visual review then found inadequate
hover contrast on its Play button; a scoped CSS correction and measured
contrast assertion are prepared, not yet deployed.

Fixture 246 (af7c/12), Classic, completed and published. It included a first
virtual-Mera authorization: admission 27.807 s, local response p95 15.2 ms,
executed receipt p95 14.7608 ms, rendering p95 17.1 ms, player/spectator holds
133.3/166.8 ms. This is not a valid-session admission pass or physical passkey
proof. Fixture 248 (7a45/12), Chaos, reused that grant, sent 110 controls,
reconnected after F5 and published 0�7. It FAILS admission at 18.490 s; other
measured gates passed: local p95 15.4 ms, receipt 14.8955 ms, frame 17.2 ms,
player/spectator holds 366.4/183.1 ms, no snapshot jumps. Original reports and
deadlines remain unchanged. Both drivers have stopped.

Canonical diagnosis at block 67049710: the challenge queue had 49 historical
requests and cursor 16. The signed transaction created request 50 but its sole
admission pass scanned only through 47. The cursor became 48 without an
admission. A read-only replay of the exact historical transaction reproduces
this: one pass gives the zero reference; two passes admit exactly 7a45/12/248.
Strict gas estimates were 1,307,317 and 2,326,691. No signature was replaced,
transaction sent, queue priority bypassed or contract state mutated by this
reproduction.

The candidate derives the number of 32-item passes from the same observed
block, caps it at four, and retains normal resumable queuing beyond that bound.
Only identical permissionless admission calls may follow the one signed
request. Gas simulation requires the longest successful prefix while keeping
the remaining original optional calls. Transport uncertainty never enables a
gas guess, different intent or nonce reuse. Public atomic capability remains
disabled until real qualification. 826 TypeScript tests pass.

Tournament 11 is complete. Its 28 fixtures match the canonical pool at block
67048954. The first unpaced RPC audit failed and is preserved; the second uses
the existing bounded read transport. This is publication proof, not finality
or 24-hour continuity. Subsequent tournaments may already run: check live
locks before any catalogue migration. Difficulty policies remain undeployed.
