# Second public reship — 7 October 2026

The user requested another reship after the preceding complete replacement. This
operation repeats that authorized replacement with the latest compatible input,
session and mobile-header fixes. It preserves all accounts, session families,
ratings, requests, historical match references and financial withdrawals. The
scheduled automation remains paused.

## Frozen source and retirement

The source agent pool is `0x89906fadc63704b003c5e5ca8e090f4dca757902`;
the human lobby is `0xb73b6957c0f213b30ec5e7e47dc307ce153833b9`.
Canonical block 68949871 verified 881 agent results, 179 challenge requests,
40 tournament books, five empty agent lanes, two empty human slots and zero
pending engine commands. Tournament 40 has 20 resolved fixtures. Its published
scores will be retained; the replacement must not invent a champion.

The six gameplay/lifecycle writers were stopped before retirement. The original
operator database, journals and advisory locks remain authoritative. Exactly the
eleven current epoch-1 apps were normally closed. No force-close was submitted.
The sole worker is `pongit-reship-repeat-retirement-20261007-1`, with original
deadline **12:04:23.761 UTC**. Actual release deadlines are **11:46:40 through
11:47:16 UTC**. A close is not a release: exact canonical sealing remains pending.
Do not duplicate this worker, its closes or its mounted scripts.

Remote operation root: `/opt/pongit/releases/reship-repeat-20261007`.
`scripts/reship-repeat-20261007.py` scopes retirement to the frozen source and
fresh backup. `scripts/reship-repeat-prepare-20261007.py` creates separately
hashed migration helpers without changing the earlier operation's files.

## Preservation evidence

The before-retirement backup contains five databases and the private runtime
archive: six files, 73,118,743 bytes. Manifest SHA-256:
`326a2014f8e5558d859f27d8b1b4cfd6bb3f8f2ce97fe7495d2bd92fd2ed4ac0`.
Every file was copied and SHA-verified outside the VPS at 10:45:04 UTC, under
`C:/Users/wwwle/.codex/private-backups/pongit/reship-repeat-20261007/backup-before`.
No key, grant or signed payload is included in public evidence.

The immutable source rating continuation audit passed. The new agent namespace
`reusable-agents-20261007-2` is prepared but not imported; fourteen modules were
deployed and the bounded preparation worker exited zero. No target arena has
been opened. The migration must import this actual public source, never a private
qualification season. Refresh backup after release and source finality.

## Client version and current limits

The npm registry now publishes SDK and CLI 0.2.3. Both are pinned exactly in the
lockfile. Root TypeScript and all 1,035 TypeScript tests pass with these packages
under Node 24.19.0. The dependency install itself used the system npm/Node 22 with
scripts disabled; this is not the production runtime. Existing production
services use Node 24.21.0. The immutable gameplay artifacts are unchanged.

Fresh hosted nodes and actual publication still require verification. The new
package does not expose an in-place reship command; the public CLI documents
`ship --again` as a new contract deployment. A fresh host is not evidence of its
unreported binary version, nor proof that every network delay is resolved.

The latest input/session/mobile fixes from `bcde17d` remain part of the candidate.
The previously recorded admission and degraded-network failures remain failed.
No new browser success, public cutover or final qualification is claimed here.

## Preparation update — 11:06 UTC

Interlude control reports all eleven predecessor sessions stopped. The normal
release worker still owns the real cooldown and exact sealing. Do not reopen
those apps or repeat their closes. No gameplay driver is running.

Four existing scoped service keys are retained in the target preparation, with
their original signer journals. No new role funding is necessary. One separately
journaled transfer moved 40 test MON from the owned sponsor to the original
operator, leaving 47.445891924 MON in the sponsor and 80.095948356 MON in the
operator immediately afterward. Transaction:
`0xe2d4102522d39296866b3dabe22de56b1a2c48cfc43b37991f30c2cf9e5a0440`.
Do not repeat it. No user funding is requested.

The prepared backup is also off-VPS verified: six files, 73,256,469 bytes,
manifest `cfb743fee0037746c7dac74fb3f8c7e0654fd4e8bd0386a5391655f24d540211`.
Its Windows copy is under the same private backup root, `backup-prepared`.

SDK 0.2.3 runtime images built from the exact previous image digests:

- Agents: `sha256:3f5947f149c4a98c90a2f88790cd6044e32ce096e2961cf78fc71ce89ac36f39`.
- Human: `sha256:ed30fc81469f50415cb84e284cfac7f6beb6f65ed7d3c78932bcf600913621a1`.

Only the audited SDK/CLI packages and matching lockfile changed in these runtime
layers. Existing gameplay code and reviewed source mounts are retained. The
images are prepared, not serving. Web dependency preparation is separate; the
final web build still needs the new contract manifests.

Five untagged intermediate PONGIT build images were removed after checking their
original build logs and every active/stopped container reference. Runtime and
rollback images, volumes and all failed evidence remain intact. Usable disk was
79.03 percent before the new dependency build.

## Rollback

Before closure, the previous compatible services could resume. After closure,
their retired gameplay apps cannot serve as a gameplay rollback. Keep admissions
closed on a failed migration; reconcile the exact existing journals and resume
only the failed phase. After cutover, a service rollback must retain the new
contracts, manifests, accounts and current databases. Never restore a stale dump
over transactions created after the backup. Old financial contracts remain
available for historical balances and withdrawals.
