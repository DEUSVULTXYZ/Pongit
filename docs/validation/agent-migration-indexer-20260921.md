# Agent migration preparation and history indexing, 21 September

Product commit `7b661ba` prepares a replacement catalogue and tournament book.
Neither contract is deployed. Public human play and the agent testnet preview
keep their existing contracts, web, engine controllers, keepers and sessions.
The only public service replaced in this step is the history indexer.

## Actual private trial and public inventory

Private house-controller trial 4 finished at 17:21:32 UTC, within its original
17:08:41 to 17:38:41 deadline. Match 8 ended Classic 4:3; match 9 ended Chaos 3:3
at the five-minute regulation limit. Both results were captured from publication,
with the latter correctly reported as a draw. They were not challenge-final at
capture. The driver exited zero. Its final report and earlier in-progress report
are both retained. No further driver was started.

At 17:43:23, private arena `dde…`, epoch 1, was healthy with 1,548 committed
batches and zero pending diffs. The 2,000-batch guard remains an experiment
boundary, not an approved continuous-service budget. Further admission requires
reviewing the reserve. The private 1,500 ms tick interval is still not public.

`snapshot-agent-migration.ts` completed a read-only inventory at canonical Monad
block 64508364, using EIP-1898 `requireCanonical` calls and a final block-hash
recheck. It found eight official bots, one community strategy and no pending
human challenges. The community strategy retains Classic qualification and is
not yet qualified for Chaos. All eight official identities were still reserved
for the ongoing Chaos championship. There were 66 ledger results, no registered
ranked players, no active ranking rebuild and no ranking corrections at that
specific block. This is a draft, not a final migration input: admissions remained
open, championship 4 was incomplete and some earlier fixtures were contestable.
No creator key, signed authorization or private grant was exported.

## Source-bound replacement candidates

`MigratingAgentCatalog` imports directly from an immutable, code-hash-pinned
source with the same owner and official controller. It preserves catalogue order,
official addresses, creators, metadata, controller hashes, registration blocks,
availability, per-mode qualification/evidence, creator nonces and last-tournament
ordering. Every page belongs to one source revision. Open source admissions,
an unfinished tournament, active participation, missing pages, changed source
code or a concurrent registry edit prevent completion. A changed community
controller keeps its old identity/hash and remains ineligible; it does not
inherit authorization for its replacement code. Registration signatures retain
their original EIP-712 domain and cannot be replayed against the new registry.

`ContinuingAgentTournaments` can initialize only from that completed import. Its
first new tournament follows the actual old count and the existing one-minute
deadline, continuing the four-format sequence. Historical tournament, fixture,
attempt and standings reads go to the original book. It cannot rewrite or rebind
an old fixture. Historical correction work must continue on the old authority.

These components do not migrate ratings/repeat counters, qualification retry
state, pending requests, sessions, reader routes or index bindings. The public
deployment script still creates fresh private seasons and must not be used as
a migration. Finish these remaining components, audit the final source snapshot,
preserve the old session authority where appropriate and prove real concurrent
house copies before switching public metadata.

Validation passed root TypeScript and 94 targeted Solidity cases across the
legacy, instance, balanced, migration and tournament contracts. The new import
suite has 15 cases; the continuation suite includes those cases plus seven
continuation checks, including all four historical formats followed by number 5.
The complete linked-artifact preflight passed: catalogue 16,576 bytes, continuing
book 22,875 bytes, balanced pool 32,720 bytes, unchanged arena 24,516 bytes. Both
earlier and final test/preflight reports are preserved. This is contract-harness
validation, not hosted migration proof.

## Chaos coverage evidence and its limit

The actual observation table now contains all 24 effects across 19 recent public
Chaos matches. BOSS ROUND (23) was observed in matches 60 and 63 on `7fb…`, epoch
2. These rows are compact records of decoded engine snapshots, not an independent
proof of every intermediate publication or every pair of effects.

A separate receipt audit did not pass: its first invocation rejected a mistyped
host before network access; the second could not inspect the correct node, whose
arena was subsequently observed in its challenge window. The failed report and
containers remain. Do not label that audit successful or query the next epoch
as if it contained the old receipts. The observed catalogue coverage does not
prove all combinations, animations, publication history or 24-hour continuity.

## Public history-indexer correction

The shared history indexer repeatedly reported `RPC busy; retry shortly`, with
roughly 200 requests queued at the separate indexer RPC gateway. This is a PONGIT
history-read bottleneck, distinct from Interlude's hourly publication rejection.
Three superseded private indexers still ran concurrently. After an off-VPS,
SHA-256-verified configuration backup, they were stopped at 17:49:43:
`pongit-series3-indexer`, `pongit-rules8-indexer` and
`pongit-agent-indexer-20260913`. Containers and databases remain intact. The
legacy production indexer and shared current indexer were preserved.

Pausing those workers alone did not clear the backlog. Inspection of the installed
Envio 3.9.0 source found a hard-coded chain-fetch concurrency of 100. A fetch can
fan out into multiple log requests, overwhelming the bounded gateway queue.
`ops/pin-envio-rpc-concurrency.mjs` applies an exact-version and SHA-256-checked
patch setting that value to four. It preserves the original, is idempotent, and
refuses other versions, modified runtimes and out-of-range values. Seven checks
against the actual pinned runtime passed in isolated local directories.

Only `pongit-agent-public-indexer` was recreated, at 17:57:32, retaining image
`pongit-indexer:rules8-fixture`, the source tree, database, checkpoint, handlers,
schema, upstream and resource limits. Two read-only mounts supply the patched
runtime and startup verifier from
`/opt/pongit/tests/arcade-release-20260919/indexer-concurrency-7b661ba`.
The original runtime hash is
`55aa3659411810ba518a786c813a50310bf5dade3b21050faca66578402a5ce2`;
the mounted runtime hash is
`97a7ef76cbb77ce875d1f86832f67bb17823d189148057160811ddb7e6cdffe9`.
No image was built and no database was reset.

The process resumed its stored checkpoint at 63827315. By 17:59:39 the persisted
progress was 63831313, with 138 processed events; the gateway queue was 14 rather
than approximately 200. The source target remained 64283315 and the current chain
head was further ahead, so recent shared replays are not yet fully available.
Root, docs and agent configuration returned HTTP 200, with agents/tournaments
enabled and `qualified:false`. Human engine and agents controller/keeper start
times were unchanged. The retired `/api/interlude/config` still reports closed;
the active human endpoint is `/api/independent/config`.

## Backups, rollback and remaining work

Verified off-VPS backups are `indexer-pauses-20260921T1751Z` and
`indexer-concurrency-20260921T1755Z-complete`; directory labels are identifiers,
not authoritative event times. The empty first concurrency-backup directory is
retained as an incomplete attempt. The complete backup preserves original Compose,
container configuration, Envio package/runtime and indexer configuration.
After the restart, `indexer-final-20260921T1804Z` also preserved the final Compose,
mounted files and fresh shared-indexer, public-agent and private-house database
dumps, with all six file hashes checked off VPS. This small operational backup
does not replace the separate original operator-journal backups.

Rollback changes only the indexer service: remove the two concurrency mounts,
restore its original `npm run start` command, then recreate that service against
the current database. Do not restore an old database over new indexed records or
replace the entire Compose file, which also contains the production engine
patches. Resuming the paused private indexers requires an explicit rate-budget
review. An Envio package upgrade must revisit the pinned patch before startup.

The reusable house-bot migration, concurrent hosted copies, actual browser
controls, community Chaos qualification, completion of championship 4, reviewed
reserve/rotation, replay catch-up and final unchanged 24-hour trial remain open.
Disk cleanup below 80 percent is still required before another image build.
No funding or provider configuration change was requested.
