# Agent pool release operations

## Reusable rules-15 packaging

The reusable generation has a separate `agent-reusable` Docker target and
`ops/agent-reusable.compose.yaml` profile. It must replace, not run beside, a
series or qualification writer for the same arenas. The API reader already
understands the reusable ticket and historical result formats; its tests cover
an assignment before engine admission and an old result after slot reuse.

The sanitized metadata directory contains `manifest.json`, `reusable.json` and
the reviewed `reusable-budget.json`. Only engine controllers receive the limited
engine and admission-attestor files. Keeper and sponsor keep the original shared
operator journal. The reader has no signing keys. Copy the frozen private archive
and exact retired command journal, verify the restored database, and preserve the
original maintenance prefix/state before starting a replacement writer.

This packaging creates no contracts and enables no on-chain public switches.
Public startup still requires reviewed capacity evidence. A missing publication
budget holds new admissions but leaves recovery running. The private qualifier,
partial reports and publication failures remain separate from the final unchanged
24-hour trial. Neither this Compose profile nor a successful build qualifies it.

This is the rules-11 series deployment path. It is distinct from the archived
single-app `ops/agents.compose.yaml`. These files prepare production packaging;
they do not establish qualification or authorize opening the public switches.

The release still requires the hosted, browser, financial, capacity and unchanged
24-hour gates described in `AGENT_SERIES.md`. Preserve the previous release,
existing contract references, databases and every uncertain transaction.

## Shared gateway correction, 20 September 2026

The compatible shared RPC gateway correction was deployed at 11:08 UTC while
all public game admissions remained closed. Image
`pongit-rpc:priority-359523f` has digest
`sha256:d48c9b547a298adc199e45c639339636ebf63526cb9969fc17a0d505261d3ad9`.
The existing upstream settings, 60 ms dispatch spacing, private IP and `rpc`
alias were preserved. Current headers and transaction reconciliation have
priority over backfill; the queue retains fairness and one upstream budget.
The image also carries the repository's bounded historical log-range handler.

The actual packaged image passed four HTTP queue checks with a synthetic local
upstream and network disabled. A verified off-VPS backup contains the previous
container configuration, gateway/scheduler sources, image ID and Compose file.
The previous container is stopped and disconnected as
`pongit-rpc-before-priority-20260920`. Rollback must stop/disconnect the new
container before restoring the old `rpc` alias, IP and configuration. Never run
two copies of this gateway against the same upstream budget.

The runtime Compose RPC service pins the new image instead of rebuilding the
old release's gateway sources. Public web, relayer, indexer and contracts were
not replaced. `/`, `/docs` and `/api/interlude/config` returned HTTP 200 after
the switch, with the old human application and `admission:false`. This is a
compatible infrastructure deployment, not the full game release or a latency
qualification result.

## Roles and secrets

Build the audited `agent-pool` Docker target and pin its image. The fixed-role
supervisor starts only a reader, sponsor, keeper or engine controller. It has no
Docker socket and cannot restart human services. Children receive SIGTERM; an
interrupted transaction is reconciled from its existing journal after restart.

`/metadata/manifest.json` is the sanitized public rules-11 manifest.
`/metadata/series.json` contains the matching common contracts, ordered arenas,
runtime hashes and eight official bot references, but **no engine key**. Retain
the deployment-record phase `deployed-closed`; this identifies its schema rather
than current admission availability. Release startup requires the matching
reviewed qualification hash and capacity value. A closed public switch remains
compatible with maintenance and financial/result recovery.

Only the engine role mounts `/run/pongit-agent-pool/engine.json`. Only the keeper
and sponsor mount the existing operator key. The reader has neither key. Copy
the old maintenance state to `/state/<original-prefix>-maintenance.json` while
the old keeper is stopped, preserving UID 1000 and mode 0600. Do not change the
prefix or create another operator nonce allocator: `il_lifecycle_jobs` and lock
701340 remain shared with human operations.

Restore the candidate's pool operations database into the dedicated production
database, and verify tables, rows, sequence values and unresolved jobs before
starting any writer. A newly empty database is not a migration. Restore the
shared indexer binding and replay-retention access separately. Diagnostics are
private, retained for seven days, and never contain signed payloads.

## Controlled rollout

1. Verify off-VPS backups and preserve the current image and configuration.
2. Stop the private keeper/controllers at a safe boundary; confirm their exit.
   Copy journals and restore the dedicated database. Preserve unresolved jobs.
3. Set required variables for `ops/agent-pool.compose.yaml`, including the exact
   reviewed image, original journal prefix, public metadata, protected human
   applications, dedicated database and existing operator database. Never print
   a rendered Compose configuration containing secrets.
4. Start the explicit `agent-pool` profile and verify each role privately. No
   container publishes a host port. `/healthz` means process liveness only.
5. Verify identity, current epoch, exact journal reconciliation, hosted progress,
   publication and private API. The keeper never enables production admissions;
   administrative contract switches remain authoritative.
6. After those gates, route the optional `ops/agent-pool.caddy` snippet before
   the existing generic API handler. Preserve all historical human API routes.
   Enable the reviewed on-chain public gate and web `PONG_AGENT_POOL_HOME` only
   as the final opening step. `PONG_AGENT_TOURNAMENTS_HOME` is independent.
7. Check public URLs, sessions, the next real result, replay and new admission.

The web build must contain the same public pool manifest and use
`PONG_REQUIRE_AGENT_POOL_MANIFEST=true`. Its actual HTTP CSP must include every
arena's HTTPS and WSS origin. A successful JSX fixture cannot prove this.

## Closing and rollback

Close new contract admissions and public/web switches first. Existing results,
epoch closure, receipt reconciliation and release continue. The production
keeper does not reverse a manual closure. Reuse is permitted only after actual
release and recovered results, never just because an hour elapsed.

Keep one writer per arena and the original shared nonce journal during any
service rollback. Do not start the legacy single-app bot worker against this
pool. Restore the previous web/API route if necessary while leaving dedicated
recovery running. Never revert a database over transactions accepted since its
backup, delete pending jobs, or point an old match URL at a replacement arena.

`agent-series-soak.ts` separates progressing games from merely reusable
contracts. Unobserved time and a global renewal outage fail its continuity
checks. Its report is one input to release review, not an automated opening
command. A reusable contract still needs a successful provider admission.

## Publication holds and private cadence trials

The compatible controller in `f30eb5a` retains `publication-paused` after an
actual publication refusal. A readable playing snapshot does not clear that
state. Only fresh healthy evidence for the same application and epoch resumes
writes. Result archival and lifecycle recovery continue, with exact pending
commands and nonces preserved. Do not reset a player's authorization or delete
a pending command to clear a publication hold.

On 21 September a hosted node reported `too many commits this hour` from its
publication relay. This is distinct from RPC throughput and does not establish
the quota's complete scope. The public controller still uses 300 ms maintenance
ticks. `PONG_AGENT_TICK_INTERVAL_MS=1500` is a bounded private experiment only;
measured human input p95 and Chaos processing lag do not qualify that setting
for public performance. See [the evidence](validation/agent-publication-rate-20260921.md).

The separate balanced-arena contract candidate is not an upgrade to the live
pool. It needs a fresh deployment and a migration preserving the existing
identities, registrations, ratings and requests. Never replace the frozen
deployment artifacts or an existing nonce journal with that candidate's files.
