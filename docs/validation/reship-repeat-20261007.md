# Second public reship — 7 October 2026

Current status: second reship is serving publicly; historical checkpoints below remain chronological. Full latency and 24-hour qualification still fail or remain unproven.

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

## Runtime verification — 11:15 UTC

Both prepared runtime images were executed without network access: Node 24.21.0,
SDK 0.2.3 and CLI 0.2.3 matched exactly. The first verification attempt used the
wrong npm scope and failed before importing anything; its exited container and
report are retained. Correcting the verification path required no image change.

The final web context is now the complete tracked `b5eda03` archive, SHA-256
`c534b3bb74dd1caa81b4537cc6cf69926a8a2d047f6424529bdfd633620703ec`,
with future deployment manifests applied explicitly at build time. Historical
index SQL is prepared to add a seventh schema, preserving all previous IDs.

A bounded cleanup removed 36 additional untagged intermediate images found in
six specific obsolete PONGIT build logs, after checking all container references.
Usable disk is 78.91 percent. No runtime/rollback image, volume or evidence was
removed. Source finality/import still waits for the actual release deadlines.

## Canonical retirement — 11:48 UTC

The sole retirement worker exited zero at 11:47:42 with eleven releases and
eleven exact-root verifications. Independent block 68962169 confirms all eleven
predecessors have status None and exactly the recorded finalized root/count.
No force-close was used. Do not restart the worker or repeat these transactions.

Targeted source finality is now running under the retained archive signer. Two
launch mistakes failed before creating any container or transaction: a singleton
Compose retained an absent dependency, and the human command was inherited from
the image. Both failed attempts are preserved; the bounded second attempts use
the same approved executables. The human source has two canonically final results
at block 68962465 and its temporary finality helper is stopped (exit 1, no OOM).
The agent helper is still finalizing the remaining published results; import has
not begun.

## Imports verified — 12:05 UTC

Agent import and independent comparison both exited zero: 881 ordered results,
179 requests, 40 tournament books and nine identities preserved. Tournament 40
is interrupted in the successor with its 20 resolved fixtures and no champion.
The human migration preserves 20 rating entries, all three predecessor routes,
existing families/profiles/private data, and old financial addresses. No unsettled
human payment or pending operation was found. The first human audit lacked its
read-only storage-layout input and failed before any write; its report is retained.
The same pinned artifact layout was copied and the second audit passed.

New agent pool: `0x6b09eb398668cb38db5d3a7dd857c33a371ac308`.
New human lobby: `0x71a49c00ba733724cb33d7590134d4ae96426156`.
Eight agent and three human initial delegations passed in epoch 1 with no expiry.
All four scoped service signers and their journals are retained; no role funding
transfer was repeated. Public runtime and manifest gates remain closed.

Final-source backup: six files, 73,293,316 bytes, manifest
`556dc95cbd757e71352958831711f97aed7b582225a0b65f9e66ad1616435b2a`,
verified off VPS 11:53:03 UTC. Imported backup: six files, 73,820,150 bytes,
manifest `42fc0f611efc2a18ce2391ae8f0e5310fedebba26484b505fde24e18db30411f`,
verified off VPS 12:05:52 UTC.

New additive index build passed from `b5eda03`, image
`sha256:f532750f247073ca60cde54ff434ec444d87b3bc815ddb9c26c5c39d7946d53e`.
Web build is still running. Initial URL probes before starting host-provisioning
services were unreachable; these are not publication/readiness passes. Fresh
hosting and public browser verification remain pending.

## Fresh hosting — 12:16 UTC

Web build passed, image
`sha256:32abe852817d7c8f2e261e4df1f6739ccf49dbce31961935662ada7f7e0898dd`.
New SDK0.2.3 backends and the seventh isolated index are running. The additive
history view preserves all 1,393 previously indexed references.

Cold-start DNS caused an actual readiness delay: the VPS Cloudflare resolvers
returned ENOTFOUND for new IPv4 names while Windows could resolve them. Direct
UDP queries to Google and Quad9 agreed on all eleven addresses; exact-hostname TLS
requests independently verified the expected app, epoch1 and chain4242 for each.
Only the seven PONGIT runtime services now use those verified resolvers. No host
was recreated, no delegation was closed, and nonce journals were retained.

All eight new agent nodes have committed their real epoch marker. Three human
arenas report available/online. The bounded challenge-opening verifier started
12:15:46, original limit900 seconds. Web/admission cutover and natural browser
games remain pending; do not equate service readiness with gameplay qualification.

## Public cutover and actual browser games — 12:38 UTC

The web cutover completed at 12:19:59 UTC. Human and friendly agent admissions
are open on the new contracts. Every public route and all eleven CSP node origins
were checked. Tournament admission is the remaining guarded opening.

The first browser challenge failed its original 180-second admission deadline.
The admission signer had only 0.023423044 MON; this was a gas reserve failure,
not a successful gameplay test. The journaled, authorized five-MON top-up
`0xb40ade551857c2c1397c7e88dc0ac7d3d3dca300234a63925a47223354381e26`
completed at 12:28:37. The first funding helper failed before any write because
it incorrectly selected a scoped operator role; its report is retained. The
corrected helper uses the original operator journal and advisory lock. No external
funding request was needed. Request 180 subsequently finished through the normal
worker without the expired browser driver; it is not a gameplay qualification.

Actual public Chrome Chaos match 883 finished naturally 3–7 and published.
Zero pauses, resumes and visible resynchronizations; send p95 17.45 ms, independent
observer reception p95 12.30 ms, local input p95 17.1 ms. It still FAILS the full
performance gate: admission 9.064 s versus 8 s and one 38.316-pixel paddle jump.
Player maximum hold was 283.3 ms; spectator maximum hold 167.1 ms. Do not label
this report a pass or infer that reshipping fixes every reconciliation issue.

Actual public Edge Classic match 884 finished naturally 3–7 and published.
All natural synchronization gates pass: no pauses/resumes/resynchronizations or
paddle jumps, send p95 15.51 ms, observer p95 10.99 ms. The report remains FAIL
because admission was 8.760 s versus 8 s. Player/spectator maximum holds were
83.4/116.7 ms.

Actual public Edge PvP Classic and Chaos both pass natural-match synchronization
gates, each finishing 7–6. Independent peer p95 is 14.88/20.36 ms, compared with
send p95 16.28/22.57 ms. The Chaos browser report retains a sessionStorage access
error from a document. Its 0.006 MON wager paid the disconnected beneficiary in
`0x0b66d8d0ee420db0dbb54fdadf904942991f80f909253eaab643f3264dc0fc49`;
canonical before/after balances and duplicate-claim/retry reverts were verified.
These use virtual PRF authenticators, not physical passkeys.

New replay 883 passed Chrome/Edge at 360/1440 px: actual playback, final score,
focus, pixel controls, touch dimensions and contrast. Old route 873 still resolves
its original contract. No 24-hour or saturated five-plus-two capacity claim is made.

## Tournament restart and final backup � 12:44 UTC

The guarded tournament opening exited zero at 12:39:28 UTC. Only its missing
`tournament-admissions` transaction was new; earlier successful gate transactions
were read from the original journal. Reader and sponsor restarted gracefully to
load the final manifest. Pool, challenge and tournament gates are open;
`qualified=false` is preserved.

Tournament 41 (Classic elimination) started automatically. Fixture 0, match 885,
finished 7�0 with its result published; fixture 1, match 886, then started. This is
actual scheduler progression, not a claim that a full new tournament has passed.
The interrupted predecessor tournament 40 retains its 20 published fixtures.

Independent block 68972926 still verifies all eleven retired epochs None and
exact sealed roots/counts; all 881 agent and two human predecessor results are
final. Block 68972929 verifies all eleven replacements Active, epoch 1, expiry 0,
and at least two committed batches each. Continuous-delegation guards stay active.

The final backup contains six files, 73,674,700 bytes, manifest SHA-256
`b8a7bcd07a57c4dd7b143dcc819a8cd96989d92fd441025154b14fcc198e2829`.
Every file was copied and SHA-verified outside the VPS at 12:44:31 UTC. It includes
the five databases, new/previous runtime, nonce journals, protected keys, current
human deployment mount and the additive index configuration. Database dumps are
sequential consistent database snapshots, not an atomic cross-database snapshot.
A separate isolated restoration from that actual Windows copy is running.

Executed helpers and nine current image/source-override inventories are recorded
in `reship-repeat-20261007-production.json`. New public manifests retain historical
addresses and family identities. Final targeted manifest/artifact/delegation tests:
12 passed; full 1,035-test SDK verification remains recorded earlier. No further
contract or product-code change was introduced during these public checks.

## Final recovery proof � 12:48 UTC

The actual off-VPS copy was uploaded into a new restore-input directory, checked
against every original SHA, and restored sequentially in an isolated PostgreSQL
container limited to 512 MiB and half a CPU. All five databases passed at
12:48:14 UTC: 66/22/11/9/251 tables, 197 migration journal jobs and 1,399 historical
references. Only the five successful scratch databases were dropped. The restore
container is stopped; input files, dumps and reports are retained. Production
transactions and databases were never overwritten.

Operational reship is complete: human play, friendly bots and tournaments are
open on the replacements. Every performance failure above remains unresolved
and visible in the evidence. The provider does not report a node binary build;
only fresh node identities, SDK/CLI versions, real calls and commits are proved.
The scheduled follow-up is still PAUSED. No funding action is needed from the user
for this completed reship.
