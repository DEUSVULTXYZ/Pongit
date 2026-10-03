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

## 16:50 UTC — actual public history migrated, tournaments resumed

Import verification at block 67871593 passed: 463 ordered published results,
9 registered identities (8 house bots), all ratings and repeat counters, 23 books
and 67 requests. Historical grants, shared family and original URLs are retained.
Public source is 205d only. No private trial history was imported.

New authority on Monad Testnet:

| Component | Address |
| --- | --- |
| Pool | `0x1f7d8a7b470a724df48d1b72723d7782d8e6014a` |
| Catalogue | `0x333e245f898898c65eadd92e8fdddd0f4b32b166` |
| Tournament book | `0xe44dd8a79616b861ea0619a70e4f8c74bb23f8f7` |
| Ratings | `0xbe8069ceb52f5a979579e705100ccbfdefb7c766` |
| Challenges | `0x270882c5e3d57b49d78fbc510d3636bc4e62ab46` |
| Qualifications | `0x3ae42a01aaa2e63b302ac7211bf881409597b58c` |
| Preserved family | `0x42007a8d3d7017d4b43fef9e9beeb2e7cb89fccb` |
| Hub v3 | `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e` |

All eight house policies actually qualified in Classic and Chaos. Public challenge
admissions opened at16:29 and tournament admissions at16:48. Tournament24 is a
Chaos championship; fixture480 actually started with PULSE against NOVA. Old23
remains Interrupted, with17 resolved fixtures and no invented champion.

The manifest exposes rules16, progressive-v1 house policies, independent friendly
instances, heartbeat-v1 fair pauses, atomic admission and epoch-marker publication.
The user explicitly authorized public testnet evaluation before full qualification.
`qualified=false` and `verifiedCapacity=0` remain truthful. The onchain admission
review hash binds that limited authorization, not a successful five-lane/24h trial.

Two hosted arenas actually work: `0x0a52fc60bf7710b1819bc1cf46375f048e2e7568`
and `0x34a7e7c09894af4e0a95b5922a824112257df92a`, epoch1. Six other creations
received503, followed by404 discovery; uncertain creation journals remain intact.
Control health reports50/50 machines. The validator's128-delegation limit and
funding are not this constraint. No provider changes or human slots were used.

### Existing archive compatibility fix

Production exposed an old named SQL constraint accepting only rules14/15. The
CREATE IF NOT EXISTS definition did not upgrade it. Commit ffd9884 adds a locked,
idempotent constraint migration for both receipt and slot tables. A real isolated
PostgreSQL regression passed, including four concurrent initializers and rejected
rules17. Production transaction retained all274 receipts and291 slot records,
without deleting or rewriting rows. All six backend roles run immutable image
`sha256:cec312301e5d7e9bfead34f1cc14aeb3949e34bdff6275f5770b8ab870b4b743`.

Additive index schema `agents_sync_20261003` and history views preserve all old
schemas and references. Public match464 has a real rules16 replay with122 frames.
The human e4eceb6 relayer remains unchanged, running since24 September.

### Public browser failures retained and narrow rendering repair

Chrome/Edge catalogue checks passed at360/390/768/1440 plus home/tournaments/docs,
without network mocks or writes. These checks do not prove game controls.

Actual Chrome Classic474 launched and accepted inputs, but F5 recovery failed.
The coherent player rendering path bypassed the buffered-only onPlayback callback,
so its painted-frame timestamp was never renewed. The heartbeat loop correctly
refused blind liveness; after reload the game paused and later cancelled.
Commit b60d1f9 reports actually painted coherent frames too. It does not weaken
permission checks, heartbeat credit, nonce reconciliation or publication fences.
49 relevant unit tests and root TypeScript pass; a new public web build is running.
The browser harness now measures direct WebSocket commands and exact receipts,
instead of wrongly counting only HTTP writes.

A second browser attempt expired waiting for the two occupied qualification arenas
at its original180-second bound. It remains FAIL. Its later cleanup found no pending
request or active owned fixture. No driver deadline was extended. Actual rendered
F5/idle recovery on the patched web still requires a new bounded browser run.

The Codex scheduled follow-up is PAUSED and must not be restarted automatically.

## 17:00 UTC — actual public browser recovery and replay passed

Web b60d1f9 was deployed at16:52:10, immutable image
`sha256:ee52f22c2422e81d5452f1dfb8bbab100b9e1c1dba92d1d674b8bd18e76ec27b`.
Canonical Compose now points to the same eight service/index images and new
metadata mounts. Updating this restart definition did not restart human play or
restore any database. Old private Compose snapshots remain available.

Actual public HTTPS tests used a virtual PRF authenticator, the real Mera client,
real sponsorship, contracts and hosted engines. No gameplay network was mocked.
They do not establish physical passkey/mobile-device behavior.

| Observed test | Chrome Classic485 | Edge Chaos484 |
| --- | ---: | ---: |
| Catalogue click to countdown, valid session | 7.322s | 7.042s |
| Confirmed input samples | 215 | 218 |
| Intent to confirmed receipt p95 | 17.45ms | 17.00ms |
| Local movement p95 | 16.4ms | 16.8ms |
| Player frame p95 | 17.1ms | 17.2ms |
| Player maximum unmarked hold | 149.5ms | 265.8ms |
| Spectator maximum unmarked hold | 216.7ms | 183.3ms |
| Confirmed heartbeat commands | 127 | 131 |
| Explicit resume after F5 | 1 | 1 |
| Published score | 2–7 | 2–7 |

Both tests reused the Mera grant after F5, exercised110 keypress pairs, then waited
45 seconds and checked the published result. Terminal games can end before the
idle window finishes. These short samples do not qualify 24-hour availability or
five simultaneous matches. NOVA's independent friendly matches were admitted
while its competitive identity remained reserved in tournament24.

An earlier successful Classic482 report counted the intentional resume countdown
as a freeze and retained false render gates. The subsequent collector records
contract pause status explicitly. The render supplement excludes only explicit
pause/countdown, intermission, initial and terminal frames. It reports those
intervals separately and still fails an unmarked800ms stall in its regression
fixture. Original reports, including the two genuine failed attempts, are unchanged.
The supplement also removes terminal frames from the pause-duration total; real
player resume countdowns measured3.10s/3.08s.

Actual replay484 playback passed on Chrome and Edge at360 and1440 pixels:222
recorded frames, moving replay position, final score2–7, pixel controls, contrast,
16:9 court, keyboard close/focus and no blocked requests or page errors. Old
match213 still resolves its original40178/epoch12 cancellation with finality=true;
old tournament23 still resolves Interrupted with no champion.

Evidence and screenshots are in `public-migration-20261003/`. Product and targeted
checks include153 migration Solidity tests,49 player/feed/heartbeat tests,10
manifest tests,4 browser-metric tests, root TypeScript and the successful Next
production build. Earlier failed runs remain evidence, not passes.

### Rollback and remaining limits

Rollback services by selecting a compatible image in the current live-v3 Compose,
retaining current metadata, keys, databases and nonce journals. Previous web image
`sha256:2ab7dc26a41b3121531728a2f3a64f2f61896f7be1636b31e291d928a8516711`
has the known coherent-heartbeat bug; do not roll back to it casually. Close new
admissions for a severe incident, let existing matches resolve, then repair the
new authority. Do not revive the retired205d authority or overwrite current
DBs with a snapshot containing older nonces/results.

Six hosted creations remain unresolved under the observed50/50 provider machine
capacity. Contract lane count5 is not proof of five available engines. Four
simultaneous human challenges, uninterrupted rotation, the worst hosted reserve,
full human financial regression and the unchanged24h trial remain unqualified.
The requested public migration is usable for actual testing; it is not the final
complete performance qualification from the earlier plan. No MON request now.

## 17:22 UTC — final backup, actual restore and public state

The requested public migration is deployed. The public API resolves the new pool
`0x1f7d8a7b470a724df48d1b72723d7782d8e6014a`, rules16, catalogue
`0x333e245f898898c65eadd92e8fdddd0f4b32b166`, ratings
`0xbe8069ceb52f5a979579e705100ccbfdefb7c766` and tournament book
`0xe44dd8a79616b861ea0619a70e4f8c74bb23f8f7`. The existing Mera family
`0x42007a8d3d7017d4b43fef9e9beeb2e7cb89fccb` is preserved. Tournament24
is playing, with nine resolved fixtures at the final read. Tournament23 remains
Interrupted with no champion. Original public history was imported, never the
private trial season.

Backup `sync-public-20261003T1702Z` contains seven files /157,171,813 bytes,
including five databases, current runtime definitions and private journals.
The Windows off-VPS copy was SHA-verified at17:04:46; manifest SHA256 is
`ed4c29bbb3053787633cd888d6f673c1e391c07fe036741ee3782d9908b0a294`.

All five dump files were then uploaded back from that Windows copy and restored
into newly named scratch databases in a network-isolated PostgreSQL17 container.
The first two attempts in a256MiB container failed when its checkpointer was killed
by signal9. Both failed scratch databases, the first report and private diagnostic
log are preserved. The successful attempt used the existing512MiB/.5CPU isolated
restore container after checking host memory and its stopped state. It restored
11/66/21/9/146 tables respectively, checked row counts and journal/archive presence,
and completed at17:21:39 without OOM. Only the five successful scratch databases
were dropped. The container stopped cleanly; production databases were untouched.
See `public-migration-20261003/restore-1702-attempt3.json`.

Two unused PONGIT compilation-stage images were removed only after verifying no
container references or tags. Usable disk fell to78.24%; runtime images, rollback
images, volumes and other projects were preserved. No image build remains.

The final service inventory and public API check are recorded in
`public-migration-20261003/final-public-state-1.json`. Its provider subfields were
initially read at the wrong JSON nesting and are null; the separate
`provider-capacity-final.json` correctly reads the documented health payload at
17:22:24:50/50 machines, zero queued creations,128 delegation limit and11 active
estimate. The six uncertain engine creations retain their journals. HTTP404 alone
does not authorize a duplicate creation. Two hosted engines have real game proof;
five lanes and eight deployed arena contracts do not imply five available engines.

The Codex automation `pongit-release-qualification` remains PAUSED. No browser or
game qualification driver remains running, and no new scheduled task was created.
Normal public services continue. TypeScript and four browser-metric regression
tests pass on the final source. Public runtime images and rollback instructions
above remain authoritative; full capacity and24h qualification remain incomplete.
