# Public synchronization cutover — 3 October 2026

## Latest state, 13:22 UTC

The frontend is now deployed too, at 13:14:56 UTC, image
`sha256:323203d00e010623aedb8214fd28a64c5af650402fa457b0d6905567839106cc`,
source `214c95a`. It includes the candidate player projection, input ledger,
warm-up clock and rules-16 client support. The public contracts remain rules15;
contractual protective pause and progressive difficulty are **not active yet**.

Actual public Chrome and Edge checks passed at 360/390/768/1440 pixels: pixel
header and mode controls, 44-pixel minimum header controls, decoded portraits,
no horizontal overflow, no stale preview/fee notices, no page errors, and HTTP200
for home, tournaments and docs. No mocked API, signing or writes were used.
Four responsive checks and three route checks per browser are in
[`public-sync-20261003`](public-sync-20261003). Screenshots were inspected.
These checks prove deployment and UI behavior, **not playable matches**:
the real capacity response still reports zero ready arenas.

The eight exact public arena URLs all timed out from the VPS. A separate long request subsequently returned actual HTTP503 for the previous control `/config` and one exact public arena `/health`; report `legacy-http-failure.json` preserves this decisive observation. The old control
plane also timed out from both Windows and the VPS; the v3 control plane returns
its expected hub and validator. The new runtime's normal cancellation recovery
did execute: at canonical block67837587, public9b8e epoch20 is Closing with
`stakeUnlockAt=1791036155` (14:02:35 UTC / 16:02:35 Europe/Paris). The existing
maintenance service alone owns its release and archive reconciliation. The
canonical cancelled match463 and its historical route remain intact. Do not
force-close it again or confuse this deadline with a guarantee of playable bots.

The migration is concretely blocked by source tournament23, which has17 resolved
fixtures, one already-cancelled fixture pending finality/retry, and ten unplayed
fixtures. `MigratingAgentCatalogBase._closedSource` and
`ContinuingAgentTournaments.sealContinuation` require a completed source
tournament and no participating identities. An unavailable old engine prevents
finishing it. Do not fake its completion, discard its community participation,
or switch to a fresh private season. The prepared new public catalogue is
`0xc0f9607958d7f7de84bb7ced3098558de5e8cdfc`; it is unimported and disabled.

New backup `sync-public-20261003T1320Z` has seven files /150,917,448 bytes and
was SHA-verified off VPS at13:20:59 UTC. Its manifest is
`7164ff5a9860bf04d9dbd135fc750906b8210be2d4cf058a8d7acdd368b49486`.
It captures post-deployment configuration, new preparation keys and original
operator jobs, public databases and the completed private release evidence.
Do not repeat deployments or preparation transactions.

The private release worker exited0 at13:01:42 UTC. Independent read-only
verification at canonical67839510 confirms all five delegations None and the
exact sealed roots/counts. It was not reopened. All prior private workers remain
stopped; the scheduled Codex task remains PAUSED.

Build attempts1 (incomplete legacy Docker build context) and2 (copied public
manifest permissions) failed and are retained. Attempt3 used the identical
dependencies/web-build/web stages, with readable public manifests, and passed
Next compilation and TypeScript. Before building,78 unmounted historical backup
files/778,493,414 bytes were verified off VPS and offloaded; two unreferenced,
untagged PONGIT compilation stages were removed. Runtime/rollback images,
volumes, manifests, current backups and failed reports remain. Disk was79.60%
before the successful build.

## User-authorized change of delivery policy

The user explicitly requested deploying the candidate to production and using
production for testing, instead of waiting for all qualification gates and the
24-hour trial. They also requested stopping the scheduled task.
`pongit-release-qualification` is PAUSED. Do not resume it automatically.

This changes the deployment gate, not the truth of the measurements. Browser
admission, hosted clock and the full continuous trial remain unqualified.
Preserve public history, users, balances, unresolved results and nonce journals.
Never substitute any fresh private season for the public source pool.

## Actual deployment, 12:55–12:57 UTC

Public archive, maintenance, reader, sponsor, admission and engines now use the
audited runtime `4661dc3`, image
`sha256:cde504551cc44d5e4ff61b73c2a39c27515098fe98bb996f7d00b1937596a835`.
The source product files match candidate `214c95a`; newer differences are
qualification scripts and evidence. Existing databases, keys, contracts,
signer journals and the human relayer were retained. Each existing service was
replaced sequentially; no second writer was introduced. Container start checks
passed, which alone does not prove working gameplay.

Admission has `PONG_AGENT_TOURNAMENT_DRAIN=1`: current public tournament 23 may
finish, but another tournament must not start before the migration. The new
maintenance code can normally close the exact already-cancelled fixture's arena
to obtain finality. No force-close or new cancellation is authorized by this
rollout. Old hosted engines currently time out; recovery remains necessary.

Backup `sync-public-20261003T1250Z` contains seven files / 150,926,931 bytes;
all were SHA-verified off VPS at 12:49:36 UTC. Manifest SHA256:
`1a9de2280a515366ac88ff68e02104900d0bc9c13b66e9c6319daf158ae89b04`.
Runtime reports and the original private Compose are under
`/opt/pongit/releases/sync-public-214c95a`. Never publish private configurations
or restore old databases over subsequent transactions.

## Public continuation preparation

The read-only seed audit of public ratings
`0xd6d0c7c6d8546f1a044d265881f24e4f228c51f0` passed, bound to its actual
predecessor evidence and historical bytecode. Preparation started at 13:00:53 UTC
in sole container `pongit-sync-public-prepare-4661dc3`, using the original
operator journal and namespace `reusable-agents-20261003-4`. Source pool:
`0x205d5739136d6cb73d732e1146e1ce034798a613`.

Preparation deployed immutable modules only and exited0 at13:01:53 UTC. The original operator journal has13 confirmed jobs and no pending/failed job for this namespace. It has
not imported history, opened arenas, changed source gates or activated rules16
publicly. The subsequent frontend deployment is recorded above.

## Existing private recovery

`pongit-sync-queue-release-1-9c58ae5` finished the previously started private
d8bc closure/release/seal operation before its original13:18:21.215385 UTC
deadline. Independent canonical verification and the fresh backup are complete.
Do not restart it, duplicate transactions or start another private trial.

## Rollback and remaining steps

Use the saved Compose/image mappings to roll back individual services while
retaining current journals and databases. Finish normal tournament recovery,
verified source drain, compatible contract import,
manifests/index bindings and actual public browser/game tests. Bot difficulty
and protective gameplay pause need the new immutable rules-16 deployment.
