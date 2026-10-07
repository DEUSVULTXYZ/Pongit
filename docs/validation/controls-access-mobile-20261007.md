# Controls, shared arcade login and mobile headers â€” 7 October 2026

## Reproduction before this correction

Production starts at the completed `04aa0c7` reship. No contract, delegation,
result, financial module or nonce journal is replaced by this correction.

Actual public Chrome Chaos/NOVA match 863 ended naturally. Its input receipt
p95 was 16.16 ms, with no protective pause. The old movement-only gate passed,
but a new release analysis found up to 1.24 pixels of additional movement
between 50 and 250 ms after key release. The 100 ms exponential reconciliation
tail kept a confirmed stationary paddle visibly moving.

Match 864 added 75 ms in each HTTP direction and explicitly disabled the
WebSocket. This is a degraded scenario, not ordinary European latency. It ended
naturally, but input-to-confirmation p95 was 421 ms versus receipt p95 192.54 ms.
Release drift reached 22.07 pixels and a protective pause lasted 3.216 seconds.
The command lane awaited a full Chaos hydration after a verified input receipt;
another intention could replace a still-unsent release during that delay.
Both original failed performance reports are retained under
`artifacts/qualification/catalogue-stop-{baseline,delay-baseline}-oct7`.

## Compatible changes

- A matching successful rules-16 `ControlQueued` receipt immediately releases
  the input lane. Secondary Chaos metadata hydration continues independently.
  Only the owned input sequence and receipt block are reused; no physics is
  invented. A receipt never extends the visible snapshot's 500 ms freshness.
  Missing responses still use the existing signed-command journal and recovery.
- Local intention changes are no longer classified as authoritative corrections.
  A stopped local paddle consumes small acknowledgement errors at the existing
  bounded 120 px/s rate instead of retaining an exponential tail. Ball contact
  geometry remains linked to the same corrected paddle.
- One explicit login prepares the two existing two-hour gameplay families with
  the same short-lived Mera root session, which is then ended. Financial and
  profile permissions remain separate. The UI describes the scope before login.
  Existing human-only sessions still need one confirmation to add agent access.
  Human grant validation now checks actual chain expiry and the renewal margin.
- Mobile header actions use equal flexible widths. The logo and sound control
  occupy a separate first row. All actions retain at least 44 px height.

## Research and limits

The installed Interlude SDK 0.2.2 documentation separates live applied events
from settled state and documents WebSocket recovery. The renderer and gameplay
commands continue to consume live state, never wait for Monad settlement.
[Interlude SDK](https://github.com/Veenoway/interlude-sdk).

Mera's PRF signing session does not itself represent an application gameplay
authorization. PONGIT previously prepared only one of its two family grants on
login, then ended the root session. That explains the second prompt.
[Mera documentation](https://github.com/category-labs/mera).

Pointer release, cancellation, lost capture, blur and page hiding remain stop
signals. The browser can cancel a pointer when it takes over a gesture.
[Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

## Verification status

Before deployment: 1,031 TypeScript tests passed; the final focused control and
render suite passed 64 tests; root typecheck passed. A new regression holds the
Chaos hydration unresolved and verifies that movement and release both receive
unique confirmed nonces. It then expires the visible snapshot and verifies that
commands stop awaiting a genuine fresh observation.

The input/access candidate `1c56d73` was deployed at 07:09:04 UTC, image
`sha256:f57899e8f8fb5f3f77fd5c2398036371247dacfc912f85feb48e66344b6c564c`.
The 14 other Compose containers retained their image and start time. Home,
agents, tournaments, docs and the agents configuration returned HTTP 200.

The first 30 header geometry checks passed, but visual inspection rejected
mid-word wrapping at 360 px. Candidate `693eca8` changes mobile navigation to
two columns. The browser gate now also detects a word split across lines.
Neither the old geometric pass nor screenshots alone establish visual success.

Two initial home-login runs retain their failed verdicts. A newly introduced
named function inside the injected test script referenced tsx's unavailable
`__name` helper, stopping its countdown recorder. The live contract clock did
return a full three-second launch. The first harness stopped early (owned match
865 subsequently published its automatic cancellation); the second finished
match 866 naturally at 3â€“7. The harness now uses anonymous injected callbacks
and preserves the final result before asserting countdown/performance gates.

Partial evidence from 866: both gameplay family keys were prepared during the
single home login; agent play requested no additional assertion. Fifty-one
release intervals had zero drift after 50 ms; confirmed input p95 was 19.62 ms;
receipt p95 15.50 ms; peer reception p95 9.88 ms; local movement p95 17.30 ms.
No contract pause, visible resynchronization or paddle-jump gate failure was
observed. This failed harness run is not counted as a fully passing game.

The old global mobile grid in `rooms.css` also placed all links into the same
cell once the shared header became a grid. The 693eca8 deployment was rolled
back at 07:24:12 UTC. Its unused failed image was removed only after checking
every container reference; its source, reports and rollback record remain.
Removing that obsolete grid produced `c63f7c7`, deployed 07:29:10 UTC. The actual
public 30-check Chrome/Edge run passed, with no injected styles, overlaps,
broken words, overflow or targets below 44 px. Visual screenshots were inspected.

Match 867 finished naturally with all movement/render measurements passing but
8.464-second admission failing the unchanged eight-second target. Match 868
then exposed a distinct real pause: a pulse 113 ms after an input was skipped
by the 150 ms coalescing window. The 200 ms timer's next pulse queued behind a
222 ms input response, exceeding the unchanged 500 ms presence credit. The
resulting protective pause lasted 3.184 seconds. Its failed report remains.

Candidate `77082f2` limits pulse coalescing to 50 ms: with the existing 200 ms
timer, writes can remain up to 250 ms apart before transport. No contract
deadline, nonce owner, freshness check or real-disconnection safeguard changes.
The regression replays that 113/197/222 ms sequence and checks continued
presence and unique nonces. All 1,033 TypeScript tests and root typecheck pass.

The final product source `77082f2` was deployed at 07:42:08 UTC, image
`sha256:dd56ba7ea162ec8663886a743948590936ff7794af02d26a40834292581f14eb`.
The header is unchanged from the actual 30-check c63f7c7 pass. All 14 other
Compose containers kept their image and start time. Six public routes return
HTTP 200. No contract or delegation was changed.

The final natural-game series is still being collected. The first three public
Chaos matches (869, 870, 871) passed admission, countdown, input, peer reception,
frame, publication and no-pause/no-resynchronization gates. Match 870 uses Edge
at 390 px with real CDP touch events, not keyboard events masquerading as touch.
All use a virtual PRF authenticator and independent observer. This does not
establish physical mobile GPU, platform passkey or cellular performance.

A remaining outlier is explicitly preserved: match 869's stop queued for 68 ms
behind an already-sent heartbeat whose transport took 130 ms. The stop itself
then took 6 ms. Reconciliation consumed a 12.78-pixel authoritative discrepancy
over about 106 ms. Release-drift p95 was zero, but its maximum was not. An
already-signed uncertain command cannot be discarded or its nonce reused to
hide this latency. Match 870 had 68 measured releases with zero drift; match
871 had 54. No absolute zero-rollback claim follows from the passing gate.

The scheduled task remains paused; degraded networking and provider pauses
are not declared solved.

## Deployment safety and retained inputs

Both web releases keep image-only rollback helpers and SHA-verified off-VPS
Compose/runtime backups. The original gameplay databases and signer journals
are unchanged; rollback must never replace them with an old dump.

Before building, 939 unmounted obsolete build subdirectories (3,555,865,077
bytes) were offloaded. Every regular file and link in the 120,986-entry archive
was verified on Windows before removing source inputs or the VPS archive.
Evidence, runtime directories, images, volumes and old failed reports remain.
Archive SHA-256: `5fc6a552f430c7dd3b358dbf55fef33f67d84bac2cd78acd8b3501dfa07f54b8`.
Manifest SHA-256: `f9a6f9f28011847a0bfdfa5fcbb15d7ab5043881fce1b37f7865889788f04151`.
Private copy: `C:/Users/wwwle/.codex/private-backups/pongit/unused-build-sources-20261007-3`.
The permission/symlink inventory failures and initial hardlink-verifier failure
are retained. No deletion occurred on those failures. Usable disk occupancy
before the first build was 77.87%.

## Remaining transport outlier (public match 872)

The fourth final-series Chaos game is a FAIL and is never replaced by a retry
in the series count. It ended naturally at 3–7, with an 8.027-second admission.
One release took 907.61 ms from send to receipt (sequence 14); its independent
observer saw the applied event only at the end of that interval. The last
heartbeat started 137 ms before that release. The serialized heartbeat behind
it waited 834.70 ms, so the contract's unchanged 500 ms presence deadline
correctly produced a 3.383-second protective pause/resume. Normal input p95
remained 22.69 ms; that percentile does not erase the 909.52 ms maximum.

The exact canonical engine receipt succeeded and consumed 939,302 gas. During
the recorded match, health remained healthy and ungated; sampled pending diffs
never exceeded 24. There was no observed batch-capacity, -32005, NodeBusyError,
expiry, closure, settlement wait, or failed command. These observations do not
locate the 908 ms interval more precisely inside the network/provider path;
provider-side timestamps would be needed to distinguish queueing from transport.
No fabricated root cause or automatic contract-timeout increase is accepted.

The compatible patches eliminate the reproduced hydration blocking, stale
visual correction tail and excessive heartbeat coalescing. They cannot promise
zero pauses whenever an already-sent transaction takes longer than the
immutable presence allowance. The normal-game acceptance series therefore
remains incomplete, even if later individual games pass.

## ACK-only rollback correction

The paired degraded run 874 ended naturally with no protective pause, but
still failed: input-to-confirmation p95 400.23 ms and 20 visible local paddle
jumps (up to 47.09 pixels). These are product defects, not dismissed as noise.
The callback changes an input's predicted timestamp to its executed timestamp
before the next snapshot. The first fix had removed every control-list change
from reconciliation to keep local releases immediate; it also skipped these
ACK-only corrections. Slow HTTP made that ordering reproducible.

`bcde17d` adds a confirmation revision to the per-match input ledger. Local
press/release notices do not change it; a confirmed timestamp and recovery do.
The court reconciles that revision even when the physical source is unchanged.
Both agent and human courts supply it. A regression reconstructs a >30-pixel
retiming difference and verifies a <5-pixel frame change, unchanged authoritative
physics, and no reconciliation for a fresh local release. All 1,035 TypeScript
tests and root typecheck pass. Production proof for this fix follows below.

Classic/F5 match 875 on the preceding source finished naturally at 2–7. Reload
reused its scoped grant without another prompt, with one deliberate resume and
passing movement/render gates. Overall FAIL is retained for 8.671-second
admission. It is not included in the ordinary no-pause series.

Official Interlude limits were rechecked at
[Limits](https://github.com/Veenoway/interlude-sdk/blob/main/docs/LIMITS.md).
The documentation distinguishes sender, RPC, batch and commit limits. The
sampled incident does not prove any one of those limits was reached. A later
read-only node observation is retained at
`artifacts/qualification/controls-node-af19-oct7.json`; its cumulative maximum
send-lock wait was 0.027 ms. This is not a provider request-arrival trace.

Before the additional build, only four untagged builder-stage images from this
turn were removed. Their exact IDs were matched to their build logs and checked
against every active/stopped container. Runtime and rollback images were kept.
Usable disk occupancy fell from 82.09% to 78.79%. The immutable cleanup report is
`/opt/pongit/releases/controls-access-77082f2/builder-cleanup.json`.

## Final compatible deployment

Product `bcde17d` is live from 08:13:12 UTC, image
`sha256:b992342b139654737b9694a7e6f5d073f7f951d6400cc9f00b9b581ca2225697`.
The source archive SHA-256 is
`553abc15fb91f6395c76f84ac0ad7ee3dbe5d0a9960b15be81a6cac27c31a1fe`.
All 14 other Compose services retained their exact image and start time. Home,
agents, tournaments, docs and both configuration APIs return HTTP 200.

Three pre-deployment configuration/runtime files were copied and SHA-verified
on Windows at 08:09:39 UTC. Manifest SHA-256:
`8ec3756fbe97163a507c5ad251d0013905b9745a95e615b42deca28e8f1ea842`.
Private location:
`C:/Users/wwwle/.codex/private-backups/pongit/controls-access-bcde17d/backup-before`.

Immediate rollback, if required: run the `rollback bcde17d` action of
`/opt/pongit/releases/controls-access-bcde17d/release.py`. It changes only the web
image back to `dd56ba7ea162ec8663886a743948590936ff7794af02d26a40834292581f14eb`
in both Compose definitions and recreates only `arcade-web`. It does not restore
databases, signer journals, financial state, contracts or delegations. The c63
and original reship runtime images also remain available.

## Degraded network after ACK correction

Public Chaos match 876 finished naturally at 2–7 with WebSockets disabled and
75 ms added to each HTTP direction, matching the earlier degraded protocol.
Visible paddle jumps fell from 20 in match 874 to zero. There was no protective
pause, resume, visible resynchronization or frame stall above 500 ms. Local
response p95 was 16.2 ms; receipt p95 187.77 ms. This is not a full pass:
admission was 9.394 seconds, input-to-confirmation p95 441.73 ms, and one
82.22-pixel ball correction occurred near the local paddle plane. Release-drift
p95 remained 22.03 pixels while reconciling delayed authoritative input.
The original FAIL verdict, video and traces are preserved. Removing a visual
jump must not hide the larger remaining network/reconciliation error.

## Final normal-network series (frozen `bcde17d`)

Five additional public Chaos/NOVA games ended naturally and published their
results on the same deployed source. Each player had an independent live
observer. No concession, fabricated result, closed delegation or migration was
used. All five passed the synchronization gates: zero protective pauses,
resumes, visible resynchronizations, rejected commands, paddle jumps or abnormal
execution-clock stalls. The run's overall verdict also includes admission.

| Match | Browser | Admission ms | Local p95 ms | Input confirmed p95 ms | Overall |
| --- | --- | ---: | ---: | ---: | --- |
| 877 | chrome 1440px | 7407 | 16.9 | 18.24 | PASS |
| 879 | chrome 1440px | 8029 | 18.6 | 18.08 | FAIL: admission |
| 880 | msedge 1440px | 8106 | 16.2 | 18.13 | FAIL: admission |
| 881 | chrome 1440px | 7830 | 16.2 | 21.24 | PASS |
| 878 | msedge touch 390px | 7286 | 16.6 | 117.50 | PASS |

There are 254 measured release windows. Release-drift p95 is zero in every
normal game, but the maximum is 15.30 pixels, from a delayed authoritative
correction. This is not a zero-rollback guarantee. Player/observer normal holds
stay below 500 ms. The five-game *complete* performance criterion is not met:
two admissions are 8.029 and 8.106 seconds versus the strict eight-second limit.
The preceding 908 ms transport incident and the degraded-network failures remain
separate failed evidence. No 24-hour or complete-release qualification follows.

The complete before/intermediate/after inventory, individual report/video hashes,
public references and exact measurements are in the adjacent JSON, generated by
`scripts/controls-evidence-20261007.py`. Original reports are never overwritten.

Manual checks still needed: physical phone keyboard/safe-area behavior, actual
platform passkey prompts and the user's network. Reload the page to receive the
new JavaScript. A previously established human-only gameplay session can still
need one explicit approval to add agent scope; fresh arcade login prepares both
existing gameplay families. No financial permission is added.

All browser drivers finished. Automation remains PAUSED. Public `qualified=false`
is preserved. Follow-up work is the admission tail and resilience to a transaction
lasting longer than the immutable 500 ms presence allowance, with contract-change
approval required before changing that allowance. Do not hide the protected
pause or overwrite an uncertain transaction to claim success.
