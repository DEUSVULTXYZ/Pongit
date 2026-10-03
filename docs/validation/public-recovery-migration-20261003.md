# Public interrupted-season migration — 3 October 2026

The user explicitly authorized stopping blocked production activity to migrate
to the new contracts and testing the result publicly. Scheduled Codex follow-up
remains paused. Human production and historical balances are outside this change.

## Source retirement

Public source pool `0x205d5739136d6cb73d732e1146e1ce034798a613` has no occupied
lane. Tournament 23 has 17 resolved fixtures and 11 unplayed fixtures; the already
cancelled match 463 remains in its original attempt history. No champion exists.

Admission, sponsor, engines and maintenance were stopped on 3 October at
14:33–14:34 UTC. Maintenance exceeded its stop grace and exited137, without OOM;
the original operator journal had zero pending transactions afterward. Reader,
archive, indexers and human relayer remain intact.

Backup `sync-public-20261003T1437Z` contains seven files /151,006,944 bytes.
SHA-verified off VPS at14:37:48 UTC, manifest
`33976d2aa3e2c2f0b7c6dfddcdab4efcb338b4c7d504150d954141c01f7b7ca7`.

Sole bounded retirement worker `pongit-public-retirement-20261003-1` started
14:39:34 UTC, original deadline15:57:34 UTC. It uses the original operator DB,
nonce journal and lock. It closed source admission gates and normally closed
all eight old arenas. Actual release deadlines15:39:57–15:40:21 UTC. No forced
closure, new game or reopening is part of this worker. Its report is
`/opt/pongit/releases/sync-public-214c95a/retirement/public-retirement-1.json`.
Release is not yet proven at this checkpoint; never start a second writer.

## Compatible recovery candidate

`RecoveringAgentCatalog` adds explicit owner authorization to retire only the
latest stopped tournament. All source lanes and admissions must be closed.
Every bound fixture must have a final published result. A digest pins the
tournament, fixtures and attempt counts. Only participant locks belonging to
that exact tournament can be omitted in the imported catalogue; unrelated
challenge or qualification participation still blocks import.

`ContinuingAgentTournaments` exposes that predecessor tournament as Interrupted,
preserving every fixture, standing and historical reference. It never invents
a champion, completion time, score or ELO. Numbering and the four-format cycle
continue after a one-minute interval. The old book and catalogue are unmodified.
The UI does not advertise unplayed interrupted fixtures as live or upcoming.

Existing default migration still requires completed tournaments. The exceptional
deployment flag is pinned to this exact public source and tournament23. The
earlier prepared Rebalanced catalogue remains unused; immutable physics modules
and confirmed deployment transactions are reused only with matching artifacts.

## Remaining execution

Verify canonical release and exact roots; finalize and reconcile source results;
freeze archive writes and refresh off-VPS backup; import actual public history;
verify identity, ELO, pair counters, queue and family continuity; deploy runtime
manifests and index bindings; qualify new official policies and hosted arenas;
exercise public browser paths. No private trial season may replace this source.

Service rollback must retain the current DBs and signed nonce journals. Restoring
an old database over new transactions is prohibited. The interrupted old season
cannot silently be resumed alongside the new authority.

## 15:25 UTC execution checkpoint

Recovering catalogue `0x333e245f898898c65eadd92e8fdddd0f4b32b166`
is prepared but not imported. Immutable modules were reused only after matching
all creation bytes. The public source is still the original `205d` season.
Target namespace is `reusable-agents-20261003-4`, rules16 and hubv3.

153 Solidity migration tests and41 TypeScript lifecycle/compatibility tests pass.
Root TypeScript passes. Canonical source inventory at67858746 found463 results,
9 identities,23 tournaments and67 requests, none pending. Six stale finality
flags in historical tournament9 were reconciled on their original book without
changing scores. Two tournament23 results still await actual arena release.

The first retirement worker was stopped at15:20:50 before any release because
its final verifier lookup incorrectly assumed a browser manifest field. The
replacement reads the verifier from the canonical pool. A mount-target error
prevented its first launch before execution; that failed container remains.
The sole running replacement is `pongit-public-retirement-20261003-3`, report
`retirement/public-retirement-2.json`. It reuses the original operation IDs,
eight confirmed closes and original15:57:34 deadline. No close was resent.
The original report and both stopped containers are preserved.

An exact deployed-hub RPC fork at67862820 accepted16,000 synthetic batches,
64 changed words/batch,1,024 distinct slots,32 transactions/batch and1,233 raw
bytes/transaction. Cold release used82,053 gas before refunds; all latest values
survived. This is a fork bound, not hosted publication/capacity or24-hour proof.
The production trial will retain qualified=false and explicit experimental
reserve evidence. Actual public browser controls remain to be exercised.

Prepared control scripts verify source release/roots, final history and import
preservation; scoped activation then opens new v3 arenas and qualifications.
Public play/tournaments cannot open through this script before all eight house
policies have actual Classic and Chaos qualification. Shared family remains
unchanged. The scheduled Codex follow-up remains paused.

## 15:50 UTC — source released and public import started

The sole replacement retirement worker exited0 at15:40:55. All eight canonical
delegations are None with exact finalized roots and counts. Its report is
`retirement/public-retirement-2.json`; no old arena was reopened. A subsequent
finality-only scan finished before the archive captured its last result and
retains a failed/pending report. The existing archive then captured and synchronized
that result. It stopped cleanly before import.

Canonical source verification at67868667 passed:463 final ordered results,
9 identities,23 tournaments and67 requests. Tournament23 retains17 resolved
fixtures, no champion and closed admissions. All five lanes are empty.

Backup `sync-public-20261003T1547Z` contains seven files /153,406,041 bytes.
The off-VPS copy was SHA-verified at15:48:16, manifest
`51692749bf0314c209580377005b54b1b2e301febb29c5c9776633fb7c33b3dd`.
`pongit-public-v3-import-1` started15:49:08 under the original operator journal.
This imports the actual public205d source, never a private trial season.
It is not yet a verified import or playable deployment at this checkpoint.
