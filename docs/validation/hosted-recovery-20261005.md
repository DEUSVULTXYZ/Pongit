# Hosted PONGIT capacity restored — 5 October 2026

The user requested another real provisioning attempt. Interlude now reports
**80 allowed machines instead of 50**. At 02:00 UTC there were 50 live machines;
after the six accepted PONGIT requests there were 56 live, zero queued and no
capacity warning. The hosting-capacity refusal from 4 October no longer blocks
these new-hub agent applications. This does not establish which old machines
were deleted, and no Fly administration operation was performed.

## Actual provisioning and verification

Six owner-authenticated `POST /sessions` requests were accepted with HTTP 200
and `status: starting`, one per application. All were already deployed on the
new hub and Active in epoch 5; no duplicate contract deployment or new on-chain
opening was sent by these scripts.

| Application | Final observation at 02:06:58 UTC |
| --- | --- |
| `0xbfc44e0cdb647689c138445e6e4796e71c425235` | Started, identity verified, one batch published; subsequently closing |
| `0xef9dfabb2af5f9368b6d68c462ffed6e7c94ba08` | Available; two canonical batches |
| `0x64e8806edf97162377e2ebcc6aa3c28a5f139395` | Available; one canonical batch |
| `0x5572e348c5039d240b9b470c558e188345ada81b` | Available; two canonical batches |
| `0xe54eb61b664ced190b4663e3a3e5c11d7f12b748` | Available; two canonical batches |
| `0xf3cfddaa4a069a08829f76f7bcef58fd1f9469bb` | Available; two canonical batches |

Final canonical snapshot: **block 68277906**. Five active nodes passed fresh
checks of application, epoch, chain 4242, hub base block, canonical bytecode
hash, rules 16 and matching healthy publication state. Production engine health
independently reports those same five applications as `available`. Their
nonzero batch counts were verified on Monad, not inferred from an HTTP 200.
Production's existing engine workers performed their normal publication
checkpoints; no separate game or lifecycle writer was started.

Earlier read passes had HTTP errors and timeouts during startup and retirement.
All reports remain preserved. The last check skips canonically non-active
arenas instead of treating a closing node as an available one. The six newly
requested nodes were verified across these observations; only five remain
active in the final snapshot.

## Existing lifecycle ownership

The two older public arenas and the first newly hosted arena are in their
closing challenge window:

| Arena | Epoch | Actual release deadline, UTC |
| --- | --- | --- |
| `0x0a52fc60bf7710b1819bc1cf46375f048e2e7568` | 3 | 03:04:44 |
| `0x34a7e7c09894af4e0a95b5922a824112257df92a` | 2 | 03:04:57 |
| `0xbfc44e0cdb647689c138445e6e4796e71c425235` | 5 | 03:05:18 |

Existing production maintenance and archive services retain sole responsibility
for release, sealing and renewal through the original operator journal. No
manual close, force-close, release, restart or deadline extension was performed
in this intervention. Do not start another lifecycle writer for these arenas.

Each hosting attempt checked the canonical owner, runtime and Active epoch
before signing and acquired the existing per-application advisory lock 701351.
The sending event precedes its POST; prior uncertain intents and historical
epochs remain in the lifecycle journal. Signatures remained in memory. Each
new attempt has a distinct report, with no automatic POST retry loop added.

## Limits and retained evidence

- Public agents remain enabled with five configured lanes and `qualified=false`.
  Five available nodes are not proof of five simultaneous completed games,
  gameplay smoothness, migration completeness or the outstanding 24-hour trial.
- The human public health endpoint still reports all three legacy human nodes
  offline. This intervention does not restore or migrate PvP and does not
  substitute private qualification history for public player history.
- No product code, image, admission gate or public manifest was changed. The
  scheduled qualification remains paused at the user's request.
- The evidence includes six request reports, three read-only verification
  passes, current public API responses, lifecycle journals before and after,
  plus fresh full agent and original operator database dumps. Earlier failed
  observations are retained separately.
- Remote evidence root:
  `/opt/pongit/tests/arena-residue-audit-20261005`.
  Its complete SHA-256-verified off-VPS copy is retained in the private backup
  directory `hosting-recovery-20261005/arena-residue-audit-20261005`.
  All 40 files (171,494,025 bytes) match manifest SHA-256
  `2956317fd3476cdb782246c9128db72c46f91fa635934956b66d63a9eb951477`.

For the new-hub agent hosting path, contacting Interlude to raise the former
50-node limit is no longer necessary. Legacy human hosting and the remaining
gameplay qualification are separate outstanding work.
