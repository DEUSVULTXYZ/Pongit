# Synchronization and difficulty — 29 September 2026

The user prioritizes smooth controls, a genuinely easy NOVA, a progressive bot
difficulty curve and removal of preview/no-prize UI notices. Public V5 is already
open; its backend qualification status remains honest when those notices disappear.

## Confirmed defects

- Inputs were deduplicated against **processed** paddle direction. During bounded
  catch-up, an accepted queued direction differs from that state. A release could
  be silently dropped, leaving the paddle moving until another command arrived.
- Periodic permission reads occupied the command lane. A read-only hub failure
  discarded a valid sender and its known nonce, requiring a complete handshake.
- Chaos prediction hid both balls after a speculative goal, before confirmation.
- F5 could resume an old direction without sending the newly neutral local intent.
- House policies perfectly predict reflected intercepts even for NOVA. Its small
  target error and 280 ms reaction do not provide a beginner experience. The
  deployed policy and arena references are immutable; labels alone cannot fix it.

## Compatible candidate fixes

Receipt-confirmed intentions now own input deduplication. Fresh contiguous events
serve movement without awaiting a routine full read. Periodic permission
observation no longer holds the command lane; failed read-only fences retain the
sender but **still prohibit writes after the original fence expires**. Recovery
sends neutral unless a more recent local intention exists. Exact uncertain hashes,
nonce reconciliation, revocation and epoch checks remain enforced.

Chaos holds the ball immediately before a predicted goal, without inventing a
score, new serve or effects. Catalogue/tournament preview and financial boilerplate
are removed; actual technical qualification flags are unchanged.

## Evidence before deployment

- Real public Chrome/virtual-PRF Mera challenge 185, Chaos/NOVA: F5, over 100
  actual controls, concession and published result. Local response p95 15.8 ms;
  executed receipt p95 17.87 ms. The measurement now includes the executed receipt
  returned directly by `interlude_sendTransaction`; it is not just HTTP latency.
- Read-only observation of Chaos 183: 40 samples, 22 pushes in 10.2 seconds,
  processed-state lag 0–70 ms. This short observation is not a continuous SLO.
- Spectator baseline on 185 **failed** its full 60-second motion window (2,067 ms
  hold). It included preparation and a deliberately conceded short fixture.
  The failed report remains; it is not reclassified as a passing live window.
- 53 targeted TypeScript tests and root typecheck pass. The first full suite had
  one expectation fail after the new neutral recovery command; that expectation
  was corrected and the targeted suite rerun. Full suite is to be repeated.

Backup `sync-20260929T0145Z` contains agent/operator dumps and private runtime;
off-VPS SHA verification is required before changing the public web. Previous
images, databases, results and failed qualification reports remain preserved.

## Public corrections and real checks

Web `3dff671` was deployed at 01:55:30 UTC as immutable image
`sha256:b47e7954a1ef9018f8b25ab4ebba0cdec3be723906728a5c4eb07d763d164867`.
The backup above was SHA-verified off VPS before deployment. The technical
qualification flag remains false; removing UI boilerplate does not change it.

Actual public Edge/virtual-PRF Mera challenge 189 (Chaos, NOVA, a5f79 epoch 1)
passed catalogue admission, countdown, F5, 110 direction changes, explicit
fixture concession and publication. Local response p95 was 15.5 ms; the actual
executed receipt p95 was 15.1318 ms. The trial used the real public transport and
contracts, not a mocked network, but a virtual authenticator. It was a short
control trial, not a complete five-minute match or a continuous availability test.
Evidence: `artifacts/qualification/catalogue-sync-after-20260929/report.json`.

Engine image `b61e8b1` was deployed at 02:05:30 UTC. All eight arenas share one
canonical hub observation (header, multicall, header verification), refreshed
every 1.5 seconds and valid for at most three seconds from the start of the read.
Subcall failures remain isolated; stale permissions still prevent writes.

A second 60-second spectator trial on Classic 190 **failed**: the match had
already finished at 6–1 but was still advertised among uncaptured live matches.
Publication had stopped. Frame p95 was 17.1 ms, but there was no ball movement.
This is preserved separately from the earlier preparing/countdown failure; it
does not demonstrate an active live stream or passing smoothness.

Candidate `e4bd537` excludes a terminal match from discovery only when fresh
operational evidence matches its arena, epoch and match ID. Its historical URL,
participation and unpublished result remain recoverable. A read failure is not
treated as a terminal result or a released seat.

## Publication and RPC recovery

Direct hosted evidence at 02:27 UTC: f202 epoch 1 halted at batch 915 with
`commit failed: Signer had insufficient balance`; 914 batches were committed and
15 diffs remained pending. Match 190 must be recovered, never silently discarded.
The shared publisher `0xB28E684815b095aB5Fb324214cfEa63d76F3d691` held
1.126185383116930335 test MON. The controlled operator
`0x369158Ac444278541322643E46e0D5b45ac21C4C` retained 3,643.342258122 MON.
No transfer was sent during this correction. The earlier 6,000 MON transfer must
not be repeated. The earlier chat value of 0.11 MON was a decimal reporting error;
1.126 MON is the verified publisher balance.

Six actual PONGIT commits (909–914, blocks 66566107–66566117, 02:01:42–45 UTC)
each used 24,000,000 gas at 102 gwei: **2.448 MON each**, with only 2,148–2,884
calldata bytes. These are exact PONGIT fees; the entire shared account balance
change cannot be attributed to PONGIT. See
`artifacts/qualification/sync-publication-fees-20260929.json`. A small calldata
size or lower read traffic does not by itself fund this publication envelope.

The compatible backend candidate:

- Adopts an identity-verified engine for read-only recovery even when publication
  is paused. It does not authorize new writes from a healthy HTTP response.
- Preserves uncertain commands and archives a matching terminal result while
  waiting for publication. A missing receipt still never proves failure.
- Stops advertising idle arenas as available when the publisher cannot provision
  one measured commit with a 20% margin. This is a minimum liveness check, not a
  reservation or funding guarantee for a complete match.
- Shares `Retry-After` across every caller using the same Monad RPC provider.
  Adaptive spacing reduces repeated provider throttling and recovers slowly.
  Historical work and current permission reads retain separate priorities.

The secondary Monad provider actually returned a 15 requests/second limit while
configured at 20/s. Its spacing was corrected to 85 ms. This limit is distinct
from Interlude command RPC and publication quotas. The subsequent shared cooldown
fix also covers primary-provider throttling.

## Progressive house algorithms — prepared, not activated

`ProgressiveHousePolicies` introduces the following ordered ranks:
NOVA, GLITCH, DRIFT, PULSE, ECHO, VECTOR, VIPER, ONYX. Existing addresses, avatar
indices and competitive identities keep their original mapping.

Reaction delay decreases linearly from 450 to 100 ms; prediction horizon grows
from 250 to 1,300 ms. Deterministic rally mistakes decrease by seven percentage
points per level, from 55% to 6%, with smaller positioning error at higher ranks.
Independent match memory remains packed per controller. No future Chaos draw is
read. A benchmark of 1,000 identical centred incoming shots measured respectively
556, 481, 409, 341, 271, 198, 132 and 63 large aim errors. These are controlled
aim measurements, **not human win rates or hosted-match results**.

The deployed policies and arenas are immutable. Migration support is ready but
has not been executed. `RebalancedAgentCatalog` checks the previous code hash and
preserves identities, registration, ordering and creator nonces. Changed house
strategies must qualify again in both modes; old evidence and retry deadlines
cannot validate a different algorithm. Community qualifications remain unchanged.
Source draining now checks all five lanes, not only the two historical lanes.
Ratings, repeated-opponent state, pending requests, family sessions and historical
routes continue through the existing Continuing contracts.

The migration script supports a V5 predecessor and pins
`PONG_HOUSE_POLICY=progressive-v1` in its journal. The runtime and manifest check
the new module binding. Old public manifests retain their old difficulty labels;
they must not claim the new behaviour before migration and real qualification.

## Source verification and rollback

- 768 TypeScript tests and root typecheck passed before the final live-discovery
  patch; that patch passed all 12 reader regressions and root typecheck.
- 168 targeted Solidity tests passed for progressive policies and compatible
  migration. Earlier eight failures remain in their original report.
- Compiler artifact graph and sizes passed. Progressive policy runtime is 4,517
  bytes; all other candidates remain within their reviewed limits.
- RPC shared-cooldown/recovery regressions passed; staged gitleaks and diff checks
  passed before publication. Physics was not modified in this patch; no fresh
  10,000-comparison claim is made.
- `sync-backend-20260929T0228Z` contains fresh agent/operator dumps and private
  runtime/configuration. All three files were copied off VPS and SHA-verified.

Backend image from `e4bd537`:
`sha256:91808a44b73c4f69a40e5f1552953c14539faa8da255c23bf0fff7d4772a7af3`.
Actual runtime source hashes were checked against the published Git archive.
The initial build invocation used a wrong Dockerfile path and failed; the second
build succeeded. Both logs remain preserved.

Rollback uses the retained previous compatible images and configuration backups;
never restore an old database over newer operations. The shared RPC override must
be reverted independently if necessary. Human backend images/mounts and all
existing contract addresses remain unchanged by these compatible patches.

Remaining: funded publication recovery, a complete active spectator trial,
progressive-policy deployment/qualification and final migration, real difficulty
validation, full sustained concurrency and the unchanged 24-hour trial. No
complete delivery or zero-freeze claim is supported yet.
