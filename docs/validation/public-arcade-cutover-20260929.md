# Agent Arcade cutover — 29 September 2026

The user's latest instruction authorizes immediate public testnet deployment and
funding, superseding the earlier request to wait for a completed 24-hour trial.
The candidate remains explicitly `testnet-preview`, `qualified=false`, with
`verifiedCapacity=0` and no fabricated qualification reference. This does not
waive migration consistency or command/nonce safety checks.

## Recovery already deployed

At 23:56:08 UTC on 28 September, the public agent engines and keeper moved to
the reproducible d2c6033 image
`sha256:c4a4329a1f2f464f6c710c3355f286f7c7e78cfb04906cac1fcd2e04f7a4763d`.
Their original configuration, database and journals remain. Obsolete source
overrides were removed. Human services and the public web remain unchanged.
The existing healthy pinned engines were adopted despite discovery failure:
7fb epoch 8 and f868 epoch 12. Tournament 9 resumed normally.

Actual public Classic spectator windows, each 60 seconds:

| Browser/run | Match | Ball visible | Moving frames | Frame p95 | Maximum hold |
|---|---:|---:|---:|---:|---:|
| Chrome/recovery-1 | 164 | 100% | 99.47% | 17.2 ms | 116.6 ms |
| Edge/recovery-3 | 166 | 100% | 99.83% | 17.2 ms | 100 ms |

Edge recovery-2 remains a failed whole-window test: match 165 finished during
the observation and its stopped result canvas did not satisfy a live-motion
check. It is not reclassified as a pass. These short windows do not establish
continuous availability, Chaos coverage or physical-device performance.

## Funding and migration

The controlled operator is `0x369158Ac444278541322643E46e0D5b45ac21C4C` on
Monad Testnet 10143. Its balance increased by 10,000 MON. A journaled 6,000 MON
transfer to the external publisher `0xB28E684815b095aB5Fb324214cfEa63d76F3d691`
confirmed at block 66543259, transaction
`0xaf687cf64bb0cb99dc961006d6a1e6af9db5aef5da8ac17a25303d57bf5eb25d`.
This account is shared and not controlled by PONGIT. Do not repeat this transfer.
The remainder is retained for deployment and limited service signers. It does
not fund the previously estimated full 24-hour five-arena workload.

Source pool: `0x708e32a09a1f5c0d4de2477793a7d6e8d9c1b8e5`.
Source seed audit passed against canonical block 66542084: ten owner nonces
from 2935 through 2944, no seed/pair-seed calls before the irreversible seal.
The migration continues this public season, not the unrelated private pool.

The sole drain monitor started at 00:09:01 UTC, with fixed deadline 00:57 UTC.
It waits for tournament 9 to complete normally, then journals the four closed
admission gates and waits for both lanes to clear. It runs inside the existing
public keeper; do not restart that keeper or create a competing drain writer.
Its report is `diagnostics/cutover-20260929/drain.json` under the public release.

The staged migration namespace is `reusable-agents-20260929-1`, eight configured
arenas, one tournament lane and four independent friendly house instances.
Deployment must preserve all source identities, rating/repetition history,
pending challenges, qualifications and the current family authorization.
Configured arenas do not establish usable capacity.

Backup `arcade-cutover-20260928T235200Z` contains agent/operator/replay database
dumps and private runtime, with all four hashes verified off VPS. Refresh it
after the final drain and migration. Never restore an old database over newer
transactions. The exact previous recovery Compose is retained as
`compose.json.bak-recovery-d2c6033`; use it only with current credentials and
journals if rolling service code back.

Remaining work: complete drain/import; prepare scoped roles and real arenas;
deploy API/web/Compose indexer and Hasura together; verify real public catalogue
admission, controls, F5 and concurrent copies; preserve replay/history routes.
Full endurance, worst-case hosted reserve and final financial/migration checks
remain unqualified until their corresponding evidence exists.

## Public cutover completed — 00:47:46 UTC, 29 September

This checkpoint supersedes the pending steps above. Source tournament 9 completed
normally; the drain passed at 00:34:19. The import continued the public season,
including nine registered identities, ratings/repeat state, tournament ordering,
qualifications and the existing Mera family. It did not replace history with the
private qualification season.

- Pool: `0x205d5739136d6cb73d732e1146e1ce034798a613`, deployed block 66549863.
- Catalog: `0x61065e28d0a19f10bd594b6d6d93514cb49965b5`.
- Tournaments: `0xabeb417646c2b57eefbc4adb75ba1a336b5cbe87`.
- Ratings: `0xd6d0c7c6d8546f1a044d265881f24e4f228c51f0`.
- Retained family: `0x42007a8d3d7017d4b43fef9e9beeb2e7cb89fccb`.

All eight new agent arenas actually opened epoch 1 and passed hosted identity and
publication checks. No human arena was reused. Public manifest V5 exposes four
friendly challenge lanes and one tournament lane. Gates are open, with
`releaseStage=testnet-preview`, `verifiedCapacity=0` and no final qualification
claim. See `public-agent-manifest-20260929.json` for all contract/node references.

Web and agent roles are immutable **3f05c33** images:

- Web: `sha256:e6249803c489db0ad33add179bd22a397005883919c98e939682ec5cfafb2eff`.
- Backend: `sha256:f812bc51b6100aa749528d04ca0783a18f28c05f8a1b92103ed0b653c91dc290`.

Compose project `pongit-arcade-five`, configuration
`/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json`.
Services separate admission, maintenance, archive, engines, sponsor and reader.
Each signer has one journal/lock. The original operator database, legacy advisory
lock and lifecycle journal are preserved. Human relayer and its existing mounts
were not changed. Caddy routes only agent API/sponsor and web to the new services.
The public web service has a unique DNS name to avoid sharing the human stack's
`web` alias.

### Actual public catalogue and spectator evidence

Four independently authenticated virtual-PRF Mera browsers challenged NOVA from
the real public catalogue while NOVA remained in tournament match 172. All five
were simultaneously active on distinct arenas; see
`public-agent-concurrency-20260929.json`. There was no mocked chain/network.

| Run | Browser / mode | Match | Submitted controls | Local input p95 |
|---|---|---:|---:|---:|
| public-five-1 | Chrome / Classic | 173 | 222 | 15.6 ms |
| public-five-2 | Edge / Chaos | 175 | 221 | 15.1 ms |
| public-five-3 | Chrome / Classic | 176 | 222 | 15.7 ms |
| public-five-4 | Edge / Chaos | 174 | 221 | 15.2 ms |

All four verified actual countdown, controls, F5 session reuse, then an explicit
test-fixture concession and published result. These are control/recovery tests,
not claims that all fixtures naturally reached seven points. No physical passkey
was tested. Submission-response p95 was 15.8–17.4 ms; **this is not command-to-
confirmed-state latency**, which this instrumentation did not establish.

New public Chaos match 177, separate 60-second spectator windows:

| Browser | Moving frames | Frame p95 | Maximum hold |
|---|---:|---:|---:|
| Chrome | 97.44% | 17.2 ms | 416.4 ms |
| Edge | 97.72% | 17.4 ms | 484.0 ms |

Both windows passed with no page errors. They do not prove 24-hour availability,
all-device performance or absence of later freezes. Earlier failed attempts are
retained. Public catalogue visually shows the new Pixel Palace cards and Play
actions independent of tournament participation. Waiting uses the shared
segmented arcade component, with no fabricated progress percentage.

### History, database credentials and indexer correction

154 prior replay records and 581 frames were copied and fingerprint-verified into
the new agent database before cutover. Existing contracts, balances and old routes
remain. Shared PostgreSQL credentials were rotated: the old password was rejected
with PostgreSQL `28P01`; the replacement connected. Hasura is now under Compose
and uses its private environment reference. No secrets are in this report.

Changing Envio's initialized configuration failed safely. Rebinding names and
adding names both refused resume; failed logs/images remain. No reset was run.
The final solution uses three isolated indexer checkpoints and additive SQL
views, preserving legacy history while catching up the missing current human
ledger independently from live agents. See `ops/indexer-public-20260929/README.md`.

- Legacy image: `sha256:b468e5e5ffbd81ff393b2f462248e238263ca37c972212aeee6b66403c412280`.
- Backfill image: `sha256:be5c46ff2c5a` (full digest in private Compose/inventory).
- Live agents: `sha256:fe502b9ba58eaccf38316d7c80ffe13c822c5021df2b9dca641666e58ee477cf`.

At 01:13 UTC the live index was caught up to block 66556757, with nine new results;
641 legacy results remained. PostgreSQL tests verified source union, correction
selection, deduplication, cross-source three-match retention and no resurrection
of pruned data. Hasura queries returned old and new history. Public replay 173
(Classic) and 175 (Chaos) each returned HTTP 200 and 117 recorded frames. Human
historical catch-up remains in progress; it is not reported as complete.

### Funding, recovery and limits

The scoped admission/maintenance/archive/sponsor accounts received 200/200/300/200
MON once. At approximately 01:13 UTC the controlled operator retained
3,643.902979152 MON and the shared publisher held 9,800.470185383116930335 MON.
Its balance includes other users' publications. Do not repeat the 6,000 MON
transfer or attribute every balance movement to PONGIT.

The original source keeper remains the sole lifecycle writer for retired public
arenas: f868 epoch 12 and 7fb epoch 8 were closed normally, with release deadlines
01:44:54 and 01:44:57 UTC. It must release/seal/recover, without reopening this
retired pool. Retired 1c5 remains excluded. No old uncertain journal is discarded.

Publication reserve remains the reviewed 16,000 maximum / 8,000 reserved batches,
420-second lead, 7,200-second service window. A fork measured 4,170,937 gas for a
16,000-batch/256-key release; actual prior hosted proof covered 789–1,599 batches,
not the full worst case. The full unchanged 24-hour run, sustained seven-match
concurrency and all original performance gates remain unqualified. Deployment
was explicitly requested before those gates completed; no public status hides
that distinction.

### Recovery procedure

Keep all current databases and journals. Stop admissions before reverting code
that cannot understand V5; allow or reconcile active matches. The migrated source
contracts are retired, so switching blindly to the old agent API is not a valid
rollback. The previous web and images are retained, but must use current
credentials and compatible routes. Human upstreams stay unchanged. Indexer
rollback changes one image/configuration or Hasura metadata; never restore an
old dump over newer results. Caddy's exact prior file is retained as
`Caddyfile.bak-arcade-20260929`.

Final backup `arcade-public-20260929T0115Z` completed at 01:16:17 UTC. Seven files
(five database dumps, private runtime archive and private container inventory)
were copied off VPS and SHA-256 verified. Agent and replay dumps were restored
into separate temporary databases, queried successfully, then those temporary
databases were removed. The agent restore contained 165 replay records, 722
frame rows and 2,394 command jobs. The replay restore retained 641 legacy results,
10 new agent results and 23 backfilled results; the combined view returned 674.
No live database was restored or reset. Initial verification used the wrong
frame-table name; the corrected query and successful restore are documented in
the preserved report.

Off-VPS backup directory:
`C:/Users/wwwle/.codex/private-backups/pongit/arcade-public-20260929T0115Z`.
The earlier cutover/drained backups and failed attempts remain. The latest source
checks include 753 TypeScript tests before cutover, a further passing indexer
regression suite and root typecheck after the history fix, all three actual
indexer image codegen/typechecks, and PostgreSQL view tests described above.
