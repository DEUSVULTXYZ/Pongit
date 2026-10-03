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
