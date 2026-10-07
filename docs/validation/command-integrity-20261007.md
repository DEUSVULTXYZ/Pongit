# Command integrity and responsive rules — 7 October 2026

## Candidate checkpoint — 7 October, after the 16:57 restore and 17:45 balance check

This is a prepared source candidate, **not a production deployment or completed
qualification**. Public gameplay remains on web `6bb63f8`, agent rules 16 and
human rules 14. The scheduled task remains PAUSED. All six bounded social audit
workers have exited. There is no game/browser, audit or lifecycle test writer active.

### Implementation and evidence

- Agent rules 17 and human rules 18 select 300-unit/s Classic and Chaos physics.
  Historical rules keep 180. The new constructors reject a mismatched Chaos module
  graph. Replay decoders and archive constraints accept both histories.
- Rules 17 require the authenticated human presence pulse to activate play after
  the three-second countdown. The 500-ms protection is unchanged. The client
  samples painted frames independently of React and coalesces a 100-ms presence
  timer. Verified receipts release the command lane before secondary hydration.
- Local intentions reach the next canvas frame through refs. Held movement no
  longer pays an opposing smoothing velocity; release correction has a two-unit
  budget. Unacknowledged contact stops the predicted ball before reflection and
  impact audio. This still requires hosted collision/error measurements.
- The physics driver rejects a rules-17 cadence override above 50 ms. Its sleep
  accounts for receipt/journal time instead of adding the old 20-ms minimum to
  that deadline. A busy command or proof keeps its exclusive lane.
- Desktop court, score, header and effects use compact reserved regions. Replay
  is enlarged. Entry labels and English documentation use Player vs Player,
  Player vs Agent and Watch agents. Width/scroll assertions await actual browsers.
- Browser recipes retain held inputs, rapid reversal, visible-ball aiming, release
  at contact, both rendered videos with UTC overlays, and actual command latency
  separate from wire latency. Agent peer timing uses measured browser/host clock
  alignment. The degraded recipe adds 75 ms each way with ±25-ms deterministic
  jitter over real HTTP. These recipes are prepared, not passing hosted evidence.

Latest checks: 1,066 TypeScript tests; 1,095 Solidity tests in 96 suites;
root TypeScript; local Next production build; 48-artifact graph; 10,000 Classic
and 20,300 Chaos comparisons passed. Chaos includes all 24 effects and 276 pairs.
Eight fork/external Solidity checks were skipped, including actual hub capacity
and release-cost tests; none counts as a pass. All earlier failures remain.
The full TypeScript run includes the final 50-ms scheduling test; the final
52-test player subset covers the acknowledgement timing change. Source-only
auditor/harness edits were typechecked separately. See the companion JSON for hashes.

Offline matched-shot calibration has 512 incoming paths per bot and mode:
NOVA 40.82%, GLITCH 45.51%, DRIFT 50.59%, PULSE 62.70%, ECHO 70.90%, VECTOR 79.69%,
VIPER 86.72%, ONYX 95.51% returns. This measures policy ordering at 300 units/s;
it is not full matches or Chaos-with-effects difficulty qualification.

### Migration preservation

`ContinuingHumanRatings` imports original seeds and ordered published entries,
not copied current ELO. Original match IDs, repeat counters, seasons and later
historical corrections remain verifiable. Historical financial writes route to
their own market/vault; no old balance is copied or discarded. The new lobby uses
a distinct generation. Agent migration continues the existing public identities,
ratings, tournament order, community entries, requests and family authorities.

Human seed audit attempt 5 passed at canonical block 69021533: seven results,
28 rating rows, 20 original player seeds, eight pair seeds, generation 2, empty
lanes and zero pending relay commands. Its entire 50-block seed window was read,
with code/storage and canonical parent/hash checks. Attempts 1–4 remain failed.
The social subset initially covered 34 journal/rating actors only. A separate
canonical family-event/nonce completeness proof is now required by deployment;
a journal-only snapshot can no longer authorize migration. Indirect family
registration or a nonce missing from the journal fails closed for further audit.
Any block preference or outstanding queue/invitation also blocks this importer.
Social attempts 1–5 remain failed: an unavailable ancient block, a generic RPC
failure, explicit RPC `-32062` (block range too large), and two 300-second
timeouts. The successor searches the actual two-hour grant prefix, stops receipt
hydration at the deployment transaction, and reads accepted 100-block log pages.
Completed contiguous pages are checkpointed against the exact snapshot hash.
The checkpoint contains public event references only; each event is checked
again against its canonical transaction receipt before a completeness proof.
A partial scan is **not** a passing audit and never authorizes import.
Attempt 6 also reached its original 300-second limit. It preserved 40,000
contiguous blocks; 41,018 blocks remain, followed by the nonce/social checks.
Its partial cache, all six failure reports/logs and the exact auditor scripts
were copied off VPS with SHA-256
`0aa23f3b5fcdbc9ad4e050421b5a9425bab9868fd7d4f62a54abcc9853645b10`.
Attempt 7 is prepared but NOT STARTED. A later run may resume these pages for
this same snapshot only; the final migration still needs a fresh drained snapshot.
These historical reads use the existing gateway's lower-priority archive lane;
they do not change provider limits or gameplay scheduling. The official
[Monad RPC limits](https://docs.monad.xyz/reference/json-rpc/overview#eth_getlogs)
also distinguish log-range bounds from transaction or gameplay capacity.

`deploy-responsive-human.ts` and `verify-responsive-human.ts` have NOT RUN.
They require a new drained-source proof, a fresh verified backup, exact source
hashes and the complete social audit. The existing snapshot is not permission
to stop admissions or import changing state. No new arena has been opened.

### Recovery and funding

The already authorized 5-MON admission reserve transaction below is confirmed.
Tournament 42 subsequently completed all seven fixtures according to the public
API at block 69022061. Do not repeat that transfer.

Backup `command-integrity-20261007/backup-funding` contains five database dumps
and the private runtime archive: six files, 74,128,811 bytes. The actual Windows
copy was SHA-verified off VPS at 16:54:14 UTC, manifest
`12ae46a51c305ecffed7640ea4b5b45255573ed7dfa7a5e1278521c63d47aba5`.
That copy was uploaded back into an isolated restore container. All five DBs
passed at 16:57:53 UTC: 66/22/11/9/251 tables and 1,433 indexed references.
The additive rules archive constraint migration preserved row fingerprints and
passed a second idempotent application. Only successful scratch databases were
dropped; restore container exited 0 without OOM. Dumps, inputs and reports remain.
Sequential database dumps are not an atomic cross-database snapshot.

At 17:45:27 UTC, block 69033118, the owned operator still held **1.398815564 test
MON**. The existing 1,000-test-MON funding request remains pending for
`0x369158ac444278541322643e46e0d5b45ac21c4c` on Monad Testnet 10143.
Previous full reship gas was 71.698830318 MON across 197 transactions. Each opening
adds 0.01 MON; the 10-MON stake comes from the validator bond, not this operator.
No funding was taken from the shared publisher. Do not drain running role reserves
to start an underfunded partial migration.

### Next operation and rollback

1. After funding, inspect live matches, actual roles, source mounts, pending
   commands and capacity. Finish the social proof and independently review the
   candidate. Perform scoped SHA-verified disk offload below 80% before an image
   build; preserve running and rollback images, volumes, other projects and logs.
2. Build reproducible images from the published candidate. Inventory and replace
   stale source mounts explicitly; do not silently mix old and new scripts.
3. Drain the current tournament and games naturally. Close only admission gates;
   never cancel a real match or close an active delegation as a shortcut. Refresh
   source snapshots, complete social proof and off-VPS backup after draining.
4. Import the public source (never a private season), verify every preservation
   comparison, provision new responsive arenas and prove live publication.
   Keep continuous-delegation guards and the original/scoped nonce journals.
   Any actual capacity shortfall must be measured before changing this sequence.
5. Coordinate services, index, API, web and manifests. Existing addresses/URLs
   keep historical readers, finances and corrections. Test nine natural visible
   browser games, faults, seven-way concurrency, costs/slots/publication reserve,
   replays and payments. Only then freeze the candidate for the unchanged 24-hour
   trial. No current evidence satisfies these outstanding gates.

Before new admissions, rollback may restore the prior service/manifest set while
leaving unused candidate contracts sealed. Once a new match is admitted, retain
its new decoder, result writer and exact nonce authority until completion; never
point that URL at an old match. A rollback drains admissions, restores compatible
service images/configuration only, and keeps all newly written transactions,
tables and logs. Never restore an older database over production.

Current public images: web
`sha256:a66f847dff8a275cc1e75814bf28314ab5b140a116f95dc082bd321922ec1841`,
agent services
`sha256:3f5947f149c4a98c90a2f88790cd6044e32ce096e2961cf78fc71ce89ac36f39`,
human service
`sha256:ed30fc81469f50415cb84e284cfac7f6beb6f65ed7d3c78932bcf600913621a1`.
Those images do not implement this candidate. Runtime overrides are inventoried
in the private configuration archive and must accompany any service rollback.

## 16:12 UTC checkpoint — candidate not deployed

The source remains uncommitted on published baseline `3584242`. Production web
and gameplay contracts remain unchanged. No browser/game driver is active.
The one bounded reserve worker `pongit-integrity-admission-reserve-20261007-1`
exited successfully: 5 test MON moved from the owned sponsor to admission in
`0x38f656cb057b5c234fbc68960f73df1eb0bab5c0360d7c10321a944b6442c207`.
Do not repeat it or the earlier funding operations. The original journal and
scoped signer lock were used. The first dispatcher failed before creating a
container or transaction because an old Compose mount used short syntax; its
failure is retained. Sponsor remaining balance was 26.74307784 MON, admission
5.127259232 MON. Tournament 42 had been stalled by admission gas funding, not a
demonstrated Interlude fault. Verify its actual recovery separately.

Operator balance at block 69011916 was 1.398815564 MON. A request for 1,000 test
MON to the owned operator is pending. Correction verified at block 69016422:
the 10-MON stake per delegation is reserved from the validator's bond, not paid
by this operator. Opening costs 0.01 MON per arena. The preceding full reship's
197 confirmed transactions consumed 71.698830318 MON in gas. The requested
1,000 MON is an operating reserve, not an additional 110-MON stake charge or
a guarantee of a 24-hour trial. Do not spend or assume ownership of the shared
Interlude publisher balance. Useful local work continues while funding is pending.

Candidate checks: 1,056 TypeScript tests passed before the newest human continuity
service edits; 62 selected Solidity regressions passed, including responsive
launch, original-seed rating continuity, human lobby and bounded Chaos gas
regressions. Classic parity passed 10,000 cases; Chaos parity passed 20,300 cases
(including 24 effects and 276 pairs). The earlier unbounded two-second direct
Chaos-kernel call reverted and remains failed evidence; the actual bounded flow
has its own passing gas tests. Local Next production build passed. No new hosted
or visual acceptance claim follows from these checks.

New human rules 18 use an ordered predecessor ledger and original seeds through
`ContinuingHumanRatings`, with later corrections/finality forwarded in bounded
work. Migration scripts still need canonical original-seed audit, import and
preservation proof. Agent rules 17 retain existing Continuing* migration paths.
Human fresh IDs use a distinct verified generation. Original rules keep 180-unit
physics; new rules use 300. Runtime bindings, ABI/artifact packaging, pending
requests, historical readers and new browser aiming scenarios still need audit.

Keep automation disabled and continuous delegations intact. No close, undelegate,
forceClose, migration or new opening was submitted by this candidate. A fresh
operator backup is still required after the reserve transfer. The previous
14:20 off-VPS backup remains protected. VPS usable disk remains above 80 percent;
scoped offload and verification must precede any new image build.

## 15:15 UTC checkpoint — implementation in progress, production unchanged

Worktree `codex/arcade-release-20260919`, baseline published commit `3584242`.
No candidate changes have been deployed. Production web remains `6bb63f8`.
The scheduled automation remains disabled. No game, browser, build or temporary
recovery driver is active from this qualification. Do not repeat previous reship,
retirement or funding operations. Preserve the original operator database,
`il_lifecycle_jobs`, advisory lock 701340, lifecycle.json and scoped signer journals.

### Retained baseline evidence

Match 901 replay is saved at
`artifacts/command-integrity-20261007/match901-replay.json` with SHA-256
`ad905ca45fe3107c50810d9e0075b9592db977e922218123b4fce3af08c9b903`.
It records three contractual pauses and a natural 2–7 result. It does not record
the user's predicted canvas, so it cannot prove the reported false bounce.

A visible Chrome catalogue test completed natural Chaos match 905. Its report,
video and traces are retained under
`artifacts/qualification/catalogue-integrity-baseline-long-1/`.
The test used virtual PRF credentials, not a physical passkey. Admission took
15.499 seconds (FAIL). First local motion p95 was 22.3 ms, receipt p95 14.58 ms.
Those metrics do not establish sustained motion quality. The additional analysis
in `artifacts/command-integrity-20261007/baseline-motion.json` found 15 of 306
eligible held-input windows outside 95–105% of contractual speed and stopping
drift p95 5.17038 units, maximum 5.54459 (FAIL against 2-unit p95).

### Candidate status

Uncommitted changes introduce versioned 300-unit/s physics, launch presence,
100-ms presence scheduling independent of score updates, acknowledgement-aware
contact fencing, immediate input sampling, revised reconciliation, compact court
layouts and corrected entry labels. The agent version is 17; the human version
will be 18 to keep the distinct published-result schemas unambiguous. Historical
rules retain their original speed and decoders.

81 focused TypeScript tests and 27 agent Solidity tests passed. TypeScript and
Solidity compiled before the newest human integration edits. This is not hosted
qualification. Human migration integration, all versioned readers, stronger
browser assertions, new-rule parity/effects, deployment backup/restore, actual
production migration, nine natural browser games and the unchanged 24-hour trial
remain outstanding. No completion claim is justified.

The VPS usable disk measurement was 80.69%; perform scoped verified cleanup below
80% before another image build. Preserve production/rollback images, mounts,
personal documents and failed evidence. Four unrelated untracked deployment and
artifact files must not be staged or overwritten.
