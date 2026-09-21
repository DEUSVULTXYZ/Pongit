# Hosted publication hold and private cadence experiment

On 21 September 2026, public agent arena
`0x7fb78a8fbfd597daadbe6971c106720eb1510d7d`, epoch 2, stopped publishing
during tournament match 54. Its actual `/health` response reported 3,599
committed batches and rejected batch 3,600 with HTTP 429 and
`too many commits this hour`. The RPC endpoint remained readable.

This is a publication-relay limit, distinct from an RPC requests-per-second
limit. This observation does not establish its complete scope, reset policy or
whether other applications share the quota. The existing release-gas and slot
budget does not establish compliance with this additional hourly limit.

The hold was still present at 16:08:48 UTC. A preserved report with
`recovered` in its filename is **not a recovery verdict**: its body explicitly
has `ok: false`. At 16:18:33, a separate observation showed `ok: true`, no halt
and 3,815 committed batches. The keeper had resumed result capture and admitted
match 55 at 16:16:16. Recovery preceded the new controller deployment; it must
not be credited to the diagnostic patch.

## Compatible controller correction

Product `f30eb5a` prevents a stale playing snapshot from repeatedly replacing
the publication hold with a healthy `playing` status. After an actual rejected
write, the controller observes the matching node's health, preserves exact
pending commands and keeps result archival and lifecycle recovery available.
It resumes writes only after an explicitly healthy response for that epoch.
Diagnostics retain the batch, HTTP status and an allowlisted reason, not raw
relay bodies, signatures or credentials.

At approximately 16:17:58, the sole public agents controller was replaced using
the same database and image `spectator-b80bee9`, with four read-only source
mounts from `/opt/pongit/tests/arcade-release-20260919/publication-f30eb5a`:

- `scripts/agent-reusable-engines.ts`
- `shared/service-error.ts`
- `shared/agent-publication-health.ts`
- `shared/agent-house-instances.ts`

The entrypoint SHA-256 is
`60e747a080d12bc807d6e58108c3ab7e717ddfa55ac86af0423950e8a25716bb`.
The public tick interval remains 300 ms. Web, human services, financial contracts,
keepers, readers and sponsoring were not changed by this controller deployment.
The public bot space remains an unqualified testnet preview.

Validation: root TypeScript and all 650 TypeScript tests passed. Three new tests
cover hourly-publication diagnostics, identity-bound health and the private
cadence setting. There is no new physics or contract code in this patch.

## Private experiment

The separately opened house-instance arena uses a 1,500 ms maintenance tick
interval for a bounded comparison. This is not a claim that all signed player
inputs or all provider publications obey that interval. Proof submissions,
admissions and participant commands must be included in actual measurements.
The public cadence is unchanged pending real progression and rendering evidence.

The private engine retains its original command database, limited key and
nonce ownership. Its CPU allocation is 0.6 core, compared with one core for
the public controller; matches and opponents also differ. A raw before/after
comparison is not a controlled load benchmark.

`qualify-house-instance-controllers.ts` admits at most four actual games per
explicit trial, on one nearly fresh candidate epoch. It creates no production
publication budget and does not open the public gate. A recovery-only keeper
captures verified results; the driver sends no game commands. Run 1 requests
two games with an original deadline of 16:47:33 UTC and passed at 16:27:14.
Match 1 completed 0:7 and qualified both controllers for Classic. Match 2
completed 2:6 at the 300-second regulation limit and qualified both for Chaos.
These published results were still contestable when captured.

`measure-house-publications.ts` performs a ten-minute read-only sample using
sanitized metadata and no signing keys. It records actual game time, requested
clock, batch count, epoch, match and node health. It does not measure browser
rendering or prove an hour of compliance from a short extrapolation. Its source
is `f097fd7`; both complete and incomplete reports must be retained.

The completed 61-sample report gives the following **adjacent healthy in-play
intervals**, excluding entry, results and transitions between matches:

| Match | Observed wall time | Published batches | Batches per second | Game-time progress | p95 requested/processed gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Private Chaos, ID 2 | 248.875 s | 160 | 0.643 | 243.28 s | 5.39 s |
| Private human Classic, ID 3 | 30.987 s | 33 | 1.065 | 32.10 s | 1.45 s |

The interval containing human controls exceeds one batch per second despite
the longer maintenance tick interval. Reducing ticks alone does not cap all
publication traffic. The large Chaos processing gap and the human-control p95
below prevent treating this cadence as a production performance improvement.

The separate actual synthetic-owner check passed 100 confirmed direction
changes, lost-response reconciliation, injected 429 recovery, revocation and
renewal. Command p50 was 111.459 ms and p95 1,311.243 ms. It ended by concession,
with a published 0:6 result at 16:30:41; this is neither a natural seventh-point
game nor a physical Mera/browser F5 proof.

Trial 2 failed before admission because a completed human challenge still
required the queue's normal priority scan. Preserve `house-controllers-2.json`.
The bounded driver in `c97c430` scans only after verifying every private request
is completed or canceled, then rechecks the empty lane and queue permission.
It does not bypass a waiting human. Trial 3 began at 16:40:35 with four requested
games and an original deadline of 17:40:35. It passed at 17:06:15 with published
Classic 3:4, Chaos 5:2, Classic 4:3 and Chaos 2:4 results. These regulation-time
finishes do not prove concurrent instances or browser performance.

After that trial, the actual hosted node was healthy at 1,157 committed batches.
Trial 4 requests only two further games, starts at 17:08:41 and retains an
original 17:38:41 deadline. It passed at 17:21:32 with published Classic 4:3
and Chaos 3:3 at regulation time. The node subsequently reported 1,548 batches
and zero pending diffs. No further driver was started; the reserve must be
reviewed before another admission. This does not qualify concurrent copies.

## Distribution candidate, not deployed

The existing authority always selects the newest available base block, which
concentrates sequential games on one arena. A separate
`BalancedAgentInstancesPool` candidate keeps the newest base block for queue
eligibility, then chooses the least recently used **compatible** idle arena for
the selected participants. Eligibility still comes from the original published
state checks; community code must exist at the selected base block. It changes
neither game speed nor the number of simultaneous lanes.

This is not a quota guarantee: the observed provider limit may have a shared
scope. It requires a new immutable deployment and the identity-preserving
migration, not an edit to the public metadata. The existing private candidate
continues to test the original house-instance authority. The first selector
build exceeded the unchanged 32 KiB pool budget; all failed reports are retained.
The final linked candidate is 32,720 bytes (48 bytes below that allowance), its
stateless selector 2,389 bytes, and the unchanged delegated arena 24,516 bytes.
The complete linked graph passes creation/runtime/reference preflight. All 48
Solidity cases across the legacy, house-instance and balanced pools pass,
including community base-block gating and the two-lane limit. These use the
existing terminal-state harness and do not constitute hosted selector proof.

## Public championship and remaining coverage

The original public Classic championship 3 completed at 16:36:20 UTC after
starting at 12:50:45. The read-only verifier checked all 28 distinct fixtures
against the pool's captured results at canonical block 64498108, hash
`0x6835c20c1142bb352b02b427b201977f405bca1857ad5495eeceb1b86384da51`.
Every score/result agreed; seven results were challenge-final at that observation.
There were no draws. This verifies completion, not uninterrupted service during
its 13,535-second wall duration. The publication hold described above occurred
during this championship and remains part of the evidence.

Championship 4, Chaos, was playing with one resolved fixture at block 64500013.
Recent live observation rows still had no occurrence of effect 23. Neither that
coverage requirement nor the fourth-format completion gate is marked passed.

## Backups and remaining work

`publication-guard-20260921T161514Z` contains pre-change public configuration,
candidate state, agent databases and the original operator database. All files
were SHA-256 verified off VPS. The initial operator dump failed because the
container name was wrong; its empty artifact is retained as incomplete. The
subsequent complete dump succeeded through the existing database connection.

Fresh backup `house-validation-20260921T164759Z` contains the original operator,
public agent and private house databases plus current configuration, journals,
limited private test state and mounted source files. All five archived files
were SHA-256 checked off VPS. One of those five is explicitly retained as an
incomplete first tar attempt; the replacement archive succeeded after resolving
the actual keeper state mount. No secrets are included in repository evidence.

At 16:56, the shared index database reported processed block 63826907, below
its stored target 64283315 and the current chain head. The earlier Hasura repair
therefore proves query access only, not availability of recent shared replays.

Still required: finish further private comparisons, measure rendering, qualify
real browser controls and simultaneous house copies, implement a verified production
migration and establish publication pressure limits that cover real commands.
Do not claim that this diagnostic patch removes the hourly limit or qualifies
continuous service. No funding or provider configuration change is requested.

The later canonical inventory, all-24-effects observation and shared-history
indexer correction are recorded in
[the migration/indexer report](agent-migration-indexer-20260921.md). That RPC queue
correction is independent of the Interlude publication-relay quota described here.
