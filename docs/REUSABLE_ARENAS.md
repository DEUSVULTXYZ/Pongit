# Reusable arenas and testnet admission transport

## Versioned human indexing, 20 September 21:56 UTC

The independent-result handler previously hardcoded rules 4, including for a
newer human ledger, and did not recalculate shared retention on a correction.
It now binds each allowed ledger to its immutable arenas and rules version,
rejects identity/reference changes, and uses the shared correction and retention
path. It preserves existing ledger-based references and payment records.

The rules-14 candidate ledger is
`0xc5a6468ab50faacd1c4c27b977d5a2ae977dc7dd`. Its successful creation receipt
`0xcecaee4037be1de4b767199203efcf48c680450d96bee9052d83953cc4b03758`
at block 64,241,256 was rechecked before adding the public index manifest.
Seventeen targeted tests, root TypeScript checking, actual Envio code generation
and indexer type checking passed. The isolated backfill already running still
uses its frozen prior source; this correction has not modified it or production.

A second canonical 91-second publication sample, 21:46:46 to 21:48:17 UTC,
contained zero commits from the three idle candidate agent arenas. The shared
publisher's continued balance decrease during this period cannot be attributed
to those arenas. No further game was admitted while additional funding remained
pending.

An optional full-contract regression compilation failed first for missing
dependencies in its temporary sandbox; the second compiler was killed with
SIGKILL while running under a 1,800 MB limit. Both reports are preserved.
Neither attempt is a contract-test pass;
the earlier targeted contract evidence remains distinct. No production service
was restarted or contract changed by those attempts.

## Human second release and remaining tournament trials

The human rules-14 arena released epoch 2 at 21:34 UTC on 20 September.
Transaction `0xf3fb1191a851bf7f4e0fc9aa7cb983f071103ef12e876e0c921178529da46aa7`
used 1,085,437 gas. The unchanged result root was sealed and both historical
results were recaptured as final. Epoch 3 was not opened. The report, private
journal, deployment and database dump have verified off-VPS copies. The safe
release report is in `artifacts/qualification/20260920/reusable`.

The bounded tournament driver now supports the four approved formats by their
original contract IDs. Tournament 1 retains its original operation prefix and
report; IDs 2 through 4 require `PONG_REUSABLE_AGENT_TOURNAMENT_TEST` set to
`private-selected-tournament` and `PONG_REUSABLE_TOURNAMENT_ID`. It never creates
a public gate or publication budget. An interrupted trial recovers already
captured fixtures from the book and exact journaled admission, retains its
original deadline, and reports success only after closing its private book.
Parallel challenges require the explicit `qualified-challenge` setting and a
qualified, unlocked agent; the driver never closes an occupied second arena.
These additional actual tournaments have not run yet.

The source passed 591 TypeScript tests before this driver-only extension and
type checking afterwards. Those checks do not replace hosted gameplay,
financial, browser or final 24-hour qualification.

## First complete tournament, 20 September 21:28 UTC

The private Classic elimination tournament passed at 21:23:05 UTC. All seven
fixtures (logical matches 16 through 22) ran on the hosted rules-15 arena,
published on Monad and advanced the contract-owned bracket. The first ended
1-7; the remaining games reached regulation with unequal scores. The champion
is `0x23F8A67B448496896416d66A87d4E4994a99Dc98`. Tournament admissions were
closed again by transaction
`0xcf793d462dfda16a2dd0448ee156008e5cb8bf261750713cc164b6de694f3eef`.

At 21:26:24 UTC, the used arena `1c5ec...`, epoch 1, closed after 1,230 batches.
The close fixture checked all seven captured results and equality of the
engine and Monad result roots before submission. Root
`0x1202369e44b9f773c47c8d008d98b92c1aabdaeb77a7592f908b6769abaf4de1`
contains those seven results. Release is eligible at 22:26:23 UTC. The other
two hosted arenas remained open and idle. This is not proof of two active
games during renewal, and the other three tournament formats remain untested
on this deployment.

The shipped SDK registered the metadata-free community tracker
`0xd36361a5516a73307bf95cdb7495590bbb49ae59` through the isolated sponsor.
Registration transaction
`0x75e098a94446ea4c80bfd0c698257b681508038ba2ca2c3cd2342934c9b0fe78`
is confirmed. Its creator enabled availability; both gameplay qualifications
remain pending. The earlier attempt with a legacy metadata-bearing runtime
was correctly rejected before signing. That failed attempt is preserved.

A separate read-only canonical window, 21:12:36 to 21:14:07 UTC, contains 55
successful publications attributable to these arenas. Each transaction had
an 8,000,000 gas limit and gas used at 102 gwei; their total fee was 44.88 test
MON. Calldata measured at most 2,532 bytes in this window. The collector does
not attribute the shared publisher's other spending to PONGIT, and this short
window is not a guarantee of future cost or maximum payload. Further sustained
trials require additional testnet funding; no automatic transfer was made.

The final unchanged 24-hour trial has not started. Public gates remain closed.
The tournament report, closure checks, sampled publication receipts and SDK
registration proof are in `artifacts/qualification/20260920/reusable`. An exact
runtime database dump, private journals and configuration were hash-verified
off the VPS before closure.

## Publication bounds and replay indexing, 20 September 21:07 UTC

The longer read-only fork completed 16,000 batches over 86 reused storage
slots (43 changes per batch). Hub release used 1,451,957 gas before refunds.
A separate 300-batch trial with four 2,048-byte transactions per batch produced
the same release cost. Both used the actual deployed hub runtime. Earlier
timeouts and setup failures remain preserved. These results establish the
tested release bound, not hosted publication capacity or continuous rotation.
No production admission budget has been inferred from these checks alone.

Rules-15 result captures now have an explicit immutable pool/arena binding in
the Envio configuration. Historical rules-11 results keep their original rules
and share the same three-replay retention policy. Unknown emitters and foreign
arenas are rejected. Eleven archive/retention tests, root type checking, and
actual Envio code generation and type checking passed.

A new isolated indexer started at 21:06 UTC, retaining the existing human
history boundary (Monad block 62,260,200) and the previous series archive.
It uses a new database and has no public ports. Production databases and
indexers are unchanged. Backfill and real replay retrieval are still pending;
recorded frames alone do not justify bypassing the shared retention index.

The first hosted Classic elimination tournament has four published results
and its fifth match is running. Its verdict is still pending. Public human,
agent and tournament admissions remain closed, and the final unchanged
24-hour qualification has not started.

## Real renewal and dedicated capacity, 20 September 20:41 UTC

All three dedicated agent arenas are now actually hosted and ready: `f868...`
in epoch 2 and `7fb78...` / `1c5ec...` in epoch 1. This is empty-arena readiness,
not proof of simultaneous games or continuous service. Opening receipts and
exact epoch observations are in the reviewed qualification artifacts.

The human rules-14 arena completed its actual renewal test at 20:34:08 UTC.
Classic and Chaos ran in epoch 2, both results were published and captured,
and both old epoch-1 results remained verifiable as final. Chaos verified two
drand draws with observed effects 1 and 9. Scores were 5-2 and 1-5, each ended
by explicit concession. This is not the full browser/financial qualification.
Epoch 2 closed after 78 batches; its hub release deadline is 21:34:08 UTC.
The journal and report have matching off-VPS SHA-256 copies.

The 4,571-command agent handoff passed its actual import and second idempotent
check after release. An isolated database restore reproduced the exact rows of
all six runtime/archive tables. Chrome and Edge both passed the actual-build
UI fixtures (27 agent checks and 10 human checks each), using synthetic chain
responses. Original failed fixtures remain preserved.

The qualification monitor no longer counts a released but unopened contract
as available service. Playing samples require matching epoch and match IDs;
idle reusable arenas require current hosted health, published contract
eligibility and a reviewed publication budget. Empty new epochs no longer
satisfy the renewal-game check. Rules-15 monitoring is supported, but its final
24-hour trial has not started and public admission remains closed.

The first bounded hosted tournament fixture admits only one private Classic
elimination tournament, using the persistent engine writers and sole operator
journal. It retires an idle arena at 1,500 observed batches between games and
never creates a production budget or opens extra capacity. This conservative
experiment does not establish the still-pending worst-case publication bound.

## Actual releases verified, 20 September 20:10 UTC

The new human arena released epoch 1 at 19:56:46 UTC. Transaction
`0x01e7d792bceefd65b9cc7ab98cb4de23ad6a6d5f05bd625fc09de643f5ff0849`
used 1,085,437 gas. Its original root was sealed and both historical results
were recaptured after release. This is a successful close/release test, not yet
a renewed full human game or financial qualification. Its private service now
observes with admissions disabled.

The agent keeper released the actual 4,264-batch epoch at 20:09:39 UTC:
`0x52d51b311c127539ac61a5b9b3bb175572987da55933b814aa199049efef27da`.
The receipt succeeded with 1,509,550 gas and cost 0.1539741 test MON. A read at
Monad block 64256731 confirmed no active delegation and the unchanged sealed
15-result root
`0x708322ac3349b5c7d93fe9a22a44e29bcad502d80978e36b0943be1cde7699ab`.
These receipts include their respective application call paths; the fork's
hub-only gas measurement is a different scope.

The larger 16,000-batch fork attempt reached its 2,100-second harness timeout
before producing a release verdict. It remains incomplete. A longer, isolated
retry is running; neither elapsed time nor a successful smaller workload proves
the remaining admission, publication and continuity bounds.

Web build `2d889b5` passed offline compilation, type checking and prerendering.
Its private preview serves the JavaScript assets and documentation successfully.
Reusable UI fixtures use the real rules-14/15 ABI, including the named snapshot
header, pinned base block and epoch-bound controls. Early fixture failures are
preserved. Browser checks use synthetic contracts; they do not substitute for
hosted Mera, movement or financial tests. Public gates remain closed.

## Eight agents qualified; closed epoch awaiting release, 20 September 19:27 UTC

All eight house identities now have both Classic and Chaos qualifications in
the private catalog. The same rules-15 arena completed fourteen full games and
one expired-ticket cancellation, retaining fifteen canonical results. Its
4,571 journalled engine commands are confirmed. Twenty-three distinct Chaos
effects were observed; BOSS ROUND (23) remains missing from this hosted coverage.

The original qualifier still exits with a failed aggregate verdict because its
earlier proof-cache and publication-timeout failures are retained. Subsequent
recovery and successful games do not turn that failed trial into a passing
24-hour qualification. The arena closed after 4,264 batches at 19:09:31 UTC,
with real release eligibility at 20:09:31 UTC.

All fifteen complete result bodies and their canonical prefix were imported
into a separate private PostgreSQL archive. The source is Monad block 64245448,
hash `0x87486a9f3d1d6325bd0454ae2f9bf79af131d7b652baa60d853fa435020e6304`.
Both database dumps and the frozen original journal have verified off-VPS copies.
The persistent recovery keeper runs with admissions disabled and no budget file;
it can release, seal roots and recover historical results without opening games.

`scripts/import-reusable-agent-journal.ts` prepares the next handoff. It refuses
to import until the hub has released the old epoch and the full root is sealed.
It verifies each original signed command's signer, arena, epoch, nonce and match,
then imports the entire journal atomically under the runtime arena lock. Retired
commands become obsolete with their original source verdict preserved; this
does not fabricate new receipt evidence. Repeating the import must reproduce
exactly the same records. The positive hosted import is still pending release.

A read-only fork of the actual hub runtime released 5,000 synthetic batches
over 86 reused slots with 1,451,957 gas before refunds. The 16,000-batch trial is
still running. These diagnose release cost only; neither proves hosted
publication continuity, capacity or a reviewed production admission budget.

## Corrected human deployment and hosted smoke, 20 September 19:03 UTC

The canonical `1367f8f` candidate deployed successfully. Its common lobby is
`0x4ac828012cd2be48ab669a55db5a85cac81b4bcf`, with first arena
`0x3a0c55bef5682d531d8b56538b7212ee1933ff6c` and realtime market
`0xca1efcd053c4bfb0687236b75c83787b0d750e7e`. Two additional arenas are
registered but are not yet proof of capacity. Public production is unchanged.

The actual hosted smoke passed at 18:56:37 UTC: 36 Classic and 32 Chaos movement
receipts, two accepted drand proofs, active effects 2 and 20, two published and
captured results, and a historical proof after same-epoch reuse. Both matches
ended by explicit concession; the reported scores are 3-4 and 5-4. There were
82 confirmed engine operations and no uncertain operations at shutdown.
Closing epoch 1 succeeded after 61 batches. Its real hub release time is
19:56:36 UTC. The release/root-sealing worker is waiting for that deadline;
renewal has not yet passed. Private state and deployment backups were copied
off VPS and SHA-256 verified before that worker started.

The full service and browser fixtures now recognize rules 14, bind controls and
receipts to the real epoch, wait for the issued ticket to load, and retrieve an
old result from the common contract after its physical slot is reused. Type
checking and 16 targeted transport/decoder tests pass. The adapted full browser
and financial scenarios have not yet run on this candidate.

## Human fixture evidence correction, 20 September 18:52 UTC

The reusable human smoke fixture now counts `RandomnessVerified` receipts,
separately from proof submissions, and requires an observed active effect. A
proof that only advances catch-up can be submitted again at a new confirmed
revision, while uncertain commands are reconciled with their exact original
bytes before new commands. Earlier reports are preserved. This short fixture
still ends by concession when necessary; it is not a full natural-match,
browser, financial or continuity qualification.

The canonical `1367f8f` rebuild matches all 132 Solidity sources byte for byte
and passes the same 27 tests. An earlier build used six files with equivalent
CRLF line endings; neither its artifacts nor its metadata are substituted for
this canonical deployment. The private human deployment uses a new operation
prefix and independently verified off-VPS key/configuration backups. It does
not change production admission flags.

## Linked human admission size correction, 20 September 18:35 UTC

The next private human deployment stopped before creating any arena because
`ReusableGame` was 27,719 bytes. The earlier root-only size check missed growth
from the expired-ticket cancellation path. The deployment guard worked, but
several common contracts had already been created. That partial deployment and
its journal are retained; their operation IDs cannot be reused with changed bytes.

Admission and expired-ticket binding now live in a separate immutable linked
`ReusableHumanBinding` library. The validation, fixed storage, physics, public
ABI and authorization rules are unchanged. `ReusableGame` is now 22,480 bytes,
the new binding is 7,102 bytes, and the arena remains 24,035 bytes. The existing
24 KiB limit was not raised. The complete 30-contract dependency graph also passes
the explicit runtime and creation-size preflight before any deployment writes.

All 27 targeted Solidity checks pass, including library sizes, cancellation,
readiness, same-epoch reuse, historical proofs and financial settlement. Seven
actual SDK layout checks pass without changing a delegated field. TypeScript
regressions additionally reject oversized transitive libraries, missing or cyclic
dependencies and invalid link offsets. The first layout invocation could not
locate the cached compiler; the passing invocation pins the already-installed
Solc 0.8.30 and keeps networking disabled. Both reports remain available.

The full TypeScript suite passes all 577 tests. Regenerating the independent
ABIs changes only declaration order, with no added or removed public items;
type checking passes. These are code and build checks, not hosted gameplay.

This correction requires a new immutable human candidate and its actual hosted
qualification. It does not replace the public contract or reopen admissions.

## Delayed publication recovered, 20 September 18:15 UTC

The fifth terminal result in agent arena
`0xf868bdb4669f4de471555ccadc3bac5589a3fcaa`, epoch 1, was eventually
published in batch 1031 after the provider's publisher was funded.
Transaction `0x925084d75efbceb0add180f99317751cfbaf83037c180c73a98d0a70fc19d816`
at Monad block 64231517 succeeded, with 8,000,000 charged gas at 102 gwei:
0.816 test MON. Its submitted maximum fee required a 1.4592 MON provision.
The publisher is shared; its balance changes cannot all be attributed to PONGIT.

The recovery-only script verified the complete five-result canonical prefix and
the original issued ticket, then captured match 5 (4-3 at five minutes) in
transaction `0x3cdf6d98a635cd34dc3e090c0be9d8a87b12434f95d8563ab1a57e26d2615fe2`,
block 64233438. Both participation locks are now free. This sent no engine
command, new admission or delegation closure. The original publication-timeout
verdict remains failed; later recovery does not retroactively pass the trial.
The private state was backed up and its off-VPS SHA-256 verified before capture.

At 18:15:12 UTC the publisher held 4,985.306122920494194802 test MON.
The same-source qualifier resumed at 18:15:36 UTC with its existing journal and
captured matches. It remains private and is not the final unchanged 24-hour run.
Production's compatible web/API release is now `802ae5e`; public human, agent
and tournament admissions remain closed pending the remaining qualifications.

The five compact results were subsequently imported into a dedicated temporary
PostgreSQL database and proved against the canonical prefix at block 64233438.
Repeating the import passed without adding duplicates. Every result is checked
against its issued ticket and complete Merkle prefix; imported slot observations
do not become fabricated receipts. No engine command or nonce journal was moved.
The first import container used an older source without the required decoder
export and failed before database writes; it is retained. The corrected run uses
the current `802ae5e` decoder/archive modules. Source type checking and the staged
secret scan passed. This is archive recovery evidence, not continuous-service
qualification.

## Hosted cancellation and service adapters, 20 September 15:50 UTC

The replacement private pool is `0x708e32a09a1f5c0d4de2477793a7d6e8d9c1b8e5`.
Its first arena, `0xf868bdb4669f4de471555ccadc3bac5589a3fcaa`, opened a real
epoch after the previous failed candidate was released. The other registered
arenas are not yet evidence of hosted capacity.

At 15:37:32 UTC the new arena successfully completed the deliberately expired
ticket test: cancellation, actual Monad publication, pool capture, unchanged
qualification and freed participation, with its engine session still active.
Capture transaction: `0x55eb3385835dd2e9cb9bee01bf73a76cdf924cbae5f68429ff559e0425970869`.
The next match entered that same epoch. No provider configuration changed.

The first Chaos game ended naturally 1-7 but **does not qualify Chaos events**.
Its test driver reused a cached proof operation while physics catch-up required
a new revision. The earlier counter counted loop visits, not accepted random
draws. The original report is retained with a failed verdict. The corrected
driver binds retries to the confirmed revision and counts `RandomnessVerified`
receipts separately from submissions. The subsequent actual Chaos game has
already activated effect 11; its overall run remains pending and cannot erase
the earlier failure. A separate Classic match reached the contractual five-minute
limit at 4-3 and was published and captured.

The reusable service source now separates the engine controller and Monad keeper.
It retains the original operator journal, archives compact results before
acknowledging terminal receipts, and can recover a disconnected terminal slot
without inventing a transaction hash. A slot observation still needs the exact
issued ticket and canonical published Merkle prefix before settlement. Six real
disposable PostgreSQL scenarios passed, including snapshot recovery, deduplication
with a later receipt, competing histories and corrupt-storage rejection.

The keeper continues result recovery without a publication-budget file. New
admissions require reviewed worst-case evidence in `/metadata/reusable-budget.json`,
including runtime hashes, batch/whole-match reserves and staggered service age.
It aims to maintain three actually admitted arenas, retires an idle one early
while two others remain, and never treats a configured address as available
capacity. Missing evidence and failed provider admission remain explicit gates.
These new persistent services have **not yet been activated or hosted-qualified**.

Run `scripts/agent-reusable-process.mjs` with a fixed role `keeper`, `engines`,
`reader` or `sponsor`. Reviewed release metadata belongs in
`/metadata/reusable.json` and `/metadata/manifest.json`; only the engine role loads
the limited engine and admission keys. The keeper and sponsor use the existing
operator journal. Original prefixes and pending jobs must survive a restart.
Never run this writer beside the private qualification driver on the same arena.

Public production remains closed at `7d35926`. The human reusable financial
migration, all eight bots, all effects, full tournaments, two active agent lanes,
reserve/release qualification, current browser build and unchanged 24-hour trial
are still required. This is implementation progress, not a completed release.

## Recovery and adapters, 20 September 15:14 UTC

The latest candidate can publish a cancellation for an **expired, never-admitted
ticket** while keeping the engine session open. It verifies the original signed
ticket, authority, binding, actual epoch and next admission sequence. It requires
real expiry and an empty or terminal physical slot. It cannot cancel a loaded or
playing match, revive expired permission for gameplay, or award points. Missing
external strategy code does not prevent cancellation: that path never calls a
strategy. Monad still requires the exact issued ticket and published result proof
before releasing participation. Previously deployed immutable candidates do not
gain this new method.

The result archive stores complete compact canonical results, without frames,
keys or player authorizations. A successful engine receipt is not acknowledged by
the reusable operator transport until its terminal records are durably stored.
After an archive failure, the exact nonce and bytes remain pending for receipt
reconciliation. Competing histories remain separate. Proofs require the exact
published prefix; a conflicting prefix needs explicit canonical selection, and
neither an emitted root nor elapsed time becomes settlement evidence.

The version-4 agent reader discovers assignments from the common Monad contract,
including tickets whose engine admission is not yet published. Old references keep
their original epoch and result after slot reuse. Player commands bind both epoch
and logical match ID; renewal/revocation use the reusable arena domain and fixed
permission slots. Human readiness waits for the painted court, then displays the
actual contract countdown. These adapters are candidates, not public activation.

Validation: 78 isolated Solidity tests passed across 11 suites, followed by 10
pool tests after adding contract-based assignment discovery. The full TypeScript
suite passes 542 tests. Five real disposable PostgreSQL scenarios pass: concurrent
idempotent storage, corrupt input rejection, retained competing histories, atomic
rollback/retry, and historical proofs after later results. They use synthetic
contract logs and are not hosted publication evidence.

The SDK layout check passes all seven generated surfaces without changing any
delegated slot. Final runtimes after cancellation and assignment discovery are
24,360 bytes for the agent arena and 31,395 bytes for its Monad-only pool, under
their respective 24 KiB and explicitly reviewed 32 KiB guards. The narrow arena
margin is tracked; no additional root logic may silently exceed that guard.

Separately, the existing private human rules-13 deployment completed the real
simultaneous test at 14:48:43 UTC: Classic 6-7, Chaos 7-5, 54.26 seconds of overlap,
134/133 and 131/139 direction changes, real Chaos bets/pressure and an automatic
0.006 test-MON wallet payout. Both results were published and captured. This is
evidence for that earlier deployment, not a substitute for qualifying the new
reusable contracts. The preceding live-10 run failed before sending transactions
because its fixture lacked the RPC Docker network; its report is preserved.

The first reusable agent candidate still awaits its actual hub release at
15:34:37 UTC before resolving its expired ticket by the old final-absence path.
Public admission remains closed. No final unchanged 24-hour trial has started.

## Agent candidate and actual human renewal, 20 September 14:12 UTC

The private human arena was actually released on Monad, consuming 1,057,504
gas, and its epoch-1 root was sealed without changing either result. Epoch 2
opened on the same application and admitted four newly registered fixture
accounts. Classic and Chaos published new results, and both epoch-1 historical
proofs remained final after actual epoch-2 gameplay. The combined run passed at
14:10:45 UTC and closed epoch 2 after 70 batches. These four matches ended by
concession, not a natural seventh point. This does not establish uninterrupted capacity,
natural full matches or production financial migration.

The rules-15 agent candidate adapts the same fixed-slot admission and result
tree to contract strategies, eight house policies, five-minute regulation and
bounded knockout overtime. Human challenges retain explicit readiness and a
scoped player key. Strategies cannot receive an external control key or a
financial permission. There are no markets in this deployment.

The Monad authority keeps tournament and challenge participation, exact issued
tickets, qualifications and ratings. Publication proofs release a match's lane
without closing the entire engine. A registered community strategy absent from
the engine's pinned base state waits for a newer arena; compatible queued work
can continue. Tournament learning is reconstructed from the current resolved
branch. Invalidated descendants and unsynchronized corrections cannot seed a
replacement bot.

The isolated regression run passed **86 Solidity tests**, including the new
arena, authority, learning correction and historical pool/series/tournament
tests. The full TypeScript suite passed **526 tests** and type checking passed
with the new hosted agent driver. Cross-language admission hash vectors agree. The actual SDK
generator and checker passed all seven layouts using the pinned vendored
protocol sources; earlier check attempts used duplicate bundled sources and
are retained as harness failures.

Measured runtimes are 23,756 bytes for the arena, 19,693 for the game library,
31,159 for the Monad-only pool and 1,926 for the learning library. The root
keeps a 24 KiB guard; only the explicit Monad authority has a 32 KiB budget.
Eight short offline games touched 46 distinct keys, not a worst-case publication
measurement. Agent contracts have not yet been deployed or hosted-qualified.
Public gates remain closed and no final unchanged 24-hour trial has started.

Status: integrated rules-14 contract candidate, **initial hosted reuse passed, not enabled**. Public human,
agent and tournament admission gates remain closed. No final 24-hour trial has
started. The existing private tests continue on their immutable deployments.

On 20 September the owner explicitly approved extending the testnet bridge to
admission. Provider capacity/configuration changes are not part of this approach.
Monad continues to choose and reserve players. A bridge transports an issued
ticket into a running Interlude session. It does not gain a spending permission.
This is a trust assumption for live admission, not a cryptographic state proof.

## Bounded storage and preserved results

`ReusableArenaStorage` backs the candidate `ReusableEventsArena`. It uses one
fixed physics slot, clears its previous state before reuse, and keeps logical
match IDs, epochs, ticket sequences and participant bindings distinct. It never
creates a storage key from a new player's address or a new logical match ID.

`PublishedResultTree` retains the ordered results in a depth-16 Merkle tree.
Only the frontier (16 words), count and root persist, with an epoch identity
outside the accumulator. One frontier word changes per append. Each leaf binds
chain 10143, arena, epoch, logical match ID, Monad admission digest and the complete
canonical result hash. Full result data and proofs remain necessary for consumers;
an opaque root is not a substitute for available history.

The capacity is 65,536 terminal results per epoch. A full tree stops admissions;
it never discards an old leaf or overwrites a live match. This is a data bound,
not a claim that a session may outlive the actual hub expiry.

## Admission and settlement boundary

`ReusableAdmission` authenticates a short-lived EIP-712 ticket for exactly one
authority, arena, epoch, admission sequence, logical match, binding, rules version
and source block reference. The domain explicitly remains Monad Testnet even
when verification runs in the engine. A ticket lasts at most 120 seconds. Scoped
player permissions and actual ready acknowledgements remain separate requirements.

`PublishedResultVerifier` does not accept an arbitrary root or a bridge signature
as a result. It requires the exact ticket recorded by the Monad authority, then
reads the registered arena's published commitment and actual hub session. Missing
publication, wrong epoch, challenge, foreign chain, altered result and an unissued
ticket are rejected. A malicious bridge admission cannot settle solely because
its result appeared in a published root.

After verified release, a permissionless read seals the final epoch root on Monad.
The future lifecycle must require that seal before resetting an arena for another
epoch. Provisional roots are read live, so a publication correction invalidates an
old proof. Consumers still need their ordered rating correction, participation
release and immutable first-payment decision; this verifier does not implement
or bypass those existing rules.

## Validation on 20 September

Sixteen Solidity tests passed in an isolated VPS container with networking off.
They cover changed ticket fields/signers/expiry, replay, clearing old state,
historical ordered proofs, admission authenticity, published-root changes,
challenge and final-root retention across renewal.

A storage-only harness completed 64 synthetic games with 128 distinct participants
and changed IDs. It touched 69 distinct storage keys in total. The measured maximum
admission call used 405,154 gas; the maximum result append used 104,898 gas. These
numbers exclude physics, contract admission integration and real Interlude
publication. The harness has an artificial terminal hook and is **not gameplay**.
The conservative library namespace bound is 82 keys (63 slot fields plus 19
epoch/accumulator words), independent of the number of games within tree capacity.
Per-publication changed-slot limits must still be tested separately.

Initial fixture failures (reserved Solidity identifier, wrong mock hub selector,
and an out-of-bounds test mutation) are preserved in the private diagnostics.
They were corrected before the passing run. No production application references
any of these new libraries yet.

## Integrated human candidate, 12:30 UTC

The human authority now reuses the existing deterministic Monad lobby, both
consents and participation locks. It records each complete ticket before the
bridge signs it. The immutable physics adapter uses the existing Classic and
24-effect Chaos engine on one physical slot, with logical IDs in snapshots,
randomness verification, pressure checkpoints and results. Both players must
acknowledge readiness before the three-second launch countdown.

`ReusableEventsLobby.captureProof` releases participation from a result proved
against the actual published commitment and exact issued ticket. Ordered ratings
retain corrections; the first payment result and cutoff remain frozen.
`ReusableEventsSettlement` requires the exact published admission for live bets.
A newer match in the slot cannot change an older match's beneficiary or market.

After release, an unfinished slot is marked cancelled without appending to the
final root: another reader may already have sealed that root. The Monad authority
uses absence from the final published prefix to record a technical cancellation
and refund. A missing RPC response or expired ticket alone cannot release a
participation lock. Renewal requires the previous root to be sealed first.

The integrated offline suite passed **40 tests**: 8 arena, 4 lobby, 8 settlement
(including inherited lobby tests) and 20 historical independent-arena regressions.
Sixty-four short matches alternating actual Classic/Chaos physics touched 42
distinct keys across the run, at most 36 distinct keys in any one short match.
These matches end by concession and do not cover the worst event/storage case.
This is not hosted publication, a maximum-duration qualification or proof of
capacity. The earlier storage-only numbers above describe a different harness.

The root and linked game fit the 24 KiB deployment guard. The Monad-only lobby
uses the existing explicitly allowlisted 32 KiB budget, checked in tests and the
deployer. Generator output identifies the single annotated mapping at slot zero;
the compiler layout check passed for all six generated surfaces, including the
new arena (commitment `8d1ff0a14e02dad8fd74e6d621b05b7cc93c6ca5c3e78ad386e68af083201626`).

The broader isolated run passed 100 tests, including the unchanged Chaos gas and
announcement regressions and the published-root golden vector. The subsequent
typed-admission cross-language vector passed with its four existing cases. The
complete TypeScript suite then passed 520 tests. These counts still describe
local execution on the isolated VPS, not hosted acceptance or a release verdict.

Final measured runtimes are 22,622 bytes (arena), 23,132 (linked game), 29,438
(Monad lobby), 5,668 (settlement) and 4,586 (result verifier). Explicit epoch
commands add a fixed argument, not a repeated wallet authorization.

The TypeScript proof index verifies ordered log prefixes, produces historical
proofs only against the exact published root/count, and rewinds only to a
verified canonical prefix. Full result records must still be archived and
replayed after a reorganization. Compact browser commands and their existing
durable journal can opt into explicit epoch plus logical-match binding; old
contracts retain their original encoding.

## Remaining implementation and qualification

### Actual first reuse, 20 September 13:07 UTC

The isolated candidate at `0x60cb8c03a2f4f0900b72788680df24e994a2ea30`
opened epoch 1 and then registered four new synthetic accounts on Monad.
The bridge admitted them in two successive games in that same session.
Classic accepted 36 movement commands and ended by concession at 3-4.
Chaos accepted 28 commands and two actual drand proofs, and ended by
concession at 3-3. Both complete result records were published and captured
by the Monad authority. The first result was proved again against the second
published root after physical-slot reuse.

Closure succeeded after 55 batches. The actual hub unlock time is
20 September 14:07:36 UTC. Release, a new epoch, payment flows, worst-case
publication and uninterrupted capacity remain separate gates. These short
concession matches do not establish natural finishes or production readiness.
The first driver report remains failed on temporary operator-journal contention;
the resumed report uses the original signed-command journal and deployments.
Private state was hash-verified off the VPS before renewal qualification.

The public configuration and all admission switches are unchanged. No request
for a provider configuration change was made.

1. Finish auditing and qualifying the complete adapter, generator layout,
   canonical result archive, bridge signer and proof consumers on hosted
   Interlude. Deployments remain isolated candidates, with public flags off.
2. Adapt the separate agent authority, five-minute rules, strategy controllers
   and tournaments to reusable arenas. This candidate does not silently change
   human game duration or run bots in human slots.
3. Measure worst-case publication size/changed slots and release costs. The
   current 31-minute admission time reserve covers the existing 30-minute human
   safety cancellation plus a margin; it is not measured publication headroom.
4. Qualify real sequential games, concurrent human/agent capacity, all financial
   paths, publication, closure and renewal. A bounded storage footprint alone
   does not prove continuous availability or remove the hub's real expiry.
5. Preserve the final unchanged 24-hour, browser, tournament, verified migration
   and off-VPS backup gates before any public activation.

There is no automatic Monad gameplay fallback and no automatic public activation.

### Actual renewal and agent transport, 20 September 14:32 UTC

The human candidate released epoch 1 at 14:07:54 UTC using 1,057,504 gas,
sealed its published roots and opened epoch 2 on the same arena. Two more
Classic/Chaos games admitted newly registered players, published their results,
and preserved both old results as final after reuse. These were concession
games, not natural finishes, browser qualification or a full financial test.
Epoch 2 closed after 70 batches and is eligible for release at 15:10:45 UTC.

The private rules-15 agent pool is deployed at
`0x468bb26495b48ce39ee240336eb95a107e03722c`. Its first arena,
`0xc063d5e9f4d503e56085d80f3cb5b683d0933b23`, was actually admitted by the
hub. The other two registered arenas are not yet qualified capacity. The
candidate passed 86 isolated Solidity tests and seven generated layout checks.

The first hosted agent trial failed before sending an admission. Its guard
used the engine's external `eth_getCode`, which returned empty bytes for the
HousePolicies contract. A canonical Monad read at the hub and engine's identical
base block 64187644 returns the expected 4,535-byte code. The correction reads
that exact pinned block and checks both session identities; the arena still
verifies the code hash internally. It never substitutes latest code.

That ticket expired during diagnosis. Its cancellation must follow real
closure, release and a final proof of absence. The failure and original nonce
journal remain intact. Retry uses a separate qualification-run identity, so
old confirmed operator receipts cannot stand in for new admissions.

Reusable event ABIs now include events emitted by linked libraries. Snapshot
decoding handles the named Header, completion validates the nested result, and
input receipts/journal recovery distinguish the epoch from the logical match ID.
The full TypeScript suite passes 533 tests, including these regressions. This
does not establish hosted agent gameplay, tournaments or the final 24-hour gate.

### Actual reuse and publication interruption, 20 September 16:16 UTC

The corrected private agent pool is
`0x708e32a09a1f5c0d4de2477793a7d6e8d9c1b8e5`, with arena
`0xf868bdb4669f4de471555ccadc3bac5589a3fcaa` actually open in epoch 1.
Two other registered arenas have not been admitted and are not counted as capacity.
An expired, never-executed ticket was cancelled, published and captured without
closing the epoch. Subsequent natural five-minute Classic (4-3) and Chaos (2-4)
matches reused that same arena and published successfully. Chaos accepted 19
verified randomness proofs and activated ten distinct effects. The original
fixture's earlier Chaos proof-cache failure remains a failure.

The next Classic match finished in the engine, but its result did not publish
within 180 seconds. The resumed qualification is therefore FAILED, not complete.
At 16:11 UTC the hub and node both reported 1,030 committed batches. Monad held
four results and the engine held five, with 15 pending changed slots. No locally
uncertain or reverted command was present in the qualifier journal.

The last successful commit, at Monad block 64206338, is
`0xe4aba90fe8e206b7d18e367033119e14918722e1ce21c631f02344792ca74975`.
It contained 1,956 calldata bytes, six diffs and one 175-byte engine transaction.
Its publisher was `0xB28E684815b095aB5Fb324214cfEa63d76F3d691`. The receipt
charged 8,000,000 gas at 102 gwei (0.816 test MON), with a 182.4 gwei fee ceiling
(1.4592 test MON maximum). The publisher's later balance was 0.706122920494194802
test MON and its confirmed/pending nonces were both 65991. This is evidence of
insufficient funding for an equivalent next publication, not proof that every
prior interruption had the same cause. No funds have been transferred to it.
The documented manual commit endpoint requires its operator token; the single
unauthenticated request was rejected and was not retried.

The human arena `0x60cb8c03a2f4f0900b72788680df24e994a2ea30` successfully
released epoch 2 at block 64207079, using 1,057,504 gas. Its roots were sealed
and recovered; epoch 3 was not opened. A separate read-only fork test using the
actual hub runtime released 1,200 batches over 86 reused slots within 1,451,957
gas before refunds. This supports the bounded-storage design, but is not hosted
capacity, publication continuity or maximum-duration qualification.

### Browser compatibility for reusable rules

Rules 14 selects the reusable human ABIs and signature domain, obtains the
logical match from the Monad ticket, and sends the actual epoch with compact
controls. Receipt decoding uses the same arguments. A previous physical slot
must not supply a recovery score for a newly assigned ticket. Rules 14 and 15
also select the complete Chaos collision kernel; historical rules retain their
own algorithms. The full TypeScript suite passes 548 tests. The legacy service
explicitly rejects rules 14 until its dedicated admission/archive worker is
wired and qualified. These changes do not activate public admissions or claim
a passing browser or financial trial for the reusable candidate.

### Human service integration, 20 September 16:55 UTC

The human reusable observer is now wired behind the explicit private
`PONG_INDEPENDENT_REUSABLE_QUALIFICATION=isolated-vps` gate. It transports the
exact Monad reservation with a separate limited admission key, verifies the
node's application, base block and epoch, and preserves the existing operator
and arena command journals. It does not choose players or sign spending rights.
Expired, never-admitted tickets submit a cancellation that must publish before
participation is released. A lost receipt is never a cancellation verdict.

Complete results are archived before acknowledging their engine commands.
After restart, a retained terminal slot can repair that archive without inventing
a transaction receipt. Captures require the canonical published prefix and the
original ticket. Historical capture never reads a later match occupying the
same slot. Final root sealing precedes recovery and reuse. A command left behind
when a service missed an epoch transition requires its old sealed root before
being retired. Missing archive, RPC or publication evidence remains unresolved.

The reusable root now exposes the original `boundMatch` and `queuedPressure`
getters used by the browser and financial bridge, retaining its fixed storage
bound. Rules-14 snapshots return a named Header struct; the pressure service
now handles that format as well as historical tuples. All readiness, start,
tick and randomness calls bind both epoch and logical match. The getters change
the immutable candidate bytecode and require a new deployment; existing
rules-14 deployments are not silently upgraded.

Admission and renewal require `PONG_INDEPENDENT_PUBLICATION_BUDGET` to reference
reviewed worst-case evidence bound to the actual deployed runtime hashes. Human
admission reserves 31 minutes, not the seven-minute agent allowance. An absent
budget holds new admissions and opening only; result recovery, release and
payments keep running. Rotation never migrates an occupied match. Additional
registered addresses are not provider capacity. The scoped key is read from
`PONG_INDEPENDENT_ADMISSION_KEY_FILE`; it is never part of the public manifest.

Twenty-six targeted Solidity tests pass. The runtime is 24,035 bytes; seven
generated Interlude surfaces pass the installed CLI layout check. Isolated
TypeScript tests cover slot reuse, archive failure, final proof of absence,
stale epochs, authority mismatch, renewal reserve and historical finality.
These are implementation checks, not a passing hosted service, browser,
financial migration or final 24-hour qualification. Public gates stay closed.

The read-only recheck at 16:45 UTC still found four results published on Monad,
five in the engine, 1,030 batches and 15 pending diffs. The publisher's balance
and nonce were unchanged. No funding transfer or protected commit call was
performed during this recheck. The request for a one-time 2 test MON funding
diagnostic remains unanswered; it must not become recurring funding implicitly.
