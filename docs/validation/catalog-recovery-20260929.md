# Agent catalogue and recovery — 29 September 2026

## Observed production defect

At 09:38 UTC the public catalogue reported four free challenge lanes, zero ready
arenas and publication unavailability. The UI discarded that capacity object,
allowed a new challenge and presented an existing request as a normal capacity
wait. Free lanes did not imply a working engine. The publisher held
1.126185383116930335 test MON; the previously verified successful publication
sample charged 2.448 MON per commit. No new transfer was made during this patch.
The controlled PONGIT account still had approximately 3,642 MON. A bounded
transfer request is pending; it is not authorization and must not be automated.

## Compatible corrections

The catalogue now distinguishes selecting a rival during recovery from starting
a challenge. A fresh, block-consistent capacity preflight runs before passkey
entry and before a new challenge submission. It does not reserve an arena or
replace contract admission checks. Healthy full capacity can still queue; an
outage cannot masquerade as an ordinary wait. Existing requests and exact
assigned references remain intact. Cancellation and uncertain sponsorship
reconciliation keep their existing paths. The reader exposes the same recovery
stage for pending requests and an additive, coalesced `/agents/capacity` view.

Pixel Palace frames now surround the headings, navigation, Classic/Chaos
selectors, cards and waiting actions. Mode icons and selection borders are
explicit; mobile targets remain at least 44 pixels. Only the catalog/layout and
presentation components change. Physics, fees, contract references, permissions
and match nonce journals are untouched. The optional dialog return-focus target
repairs focus lost when an asynchronous preflight temporarily disables its
initiating button. Other dialog callers keep their previous behavior.

The configured API origin is normalized for CSP. A path source ending in `/api`
previously did not cover `/api/agents/*` on an isolated origin; same-origin public
pages happened to work through `self`. This does not add any provider origin.

## Verification in progress

769 TypeScript tests and root typecheck pass. New Chrome and Edge development
runs each pass five viewport groups: 360, 390, 768, 1440 and landscape 844 pixels.
They cover mode styles, touch sizes, unavailable click without authentication,
stale available catalogue preflight, saved request/cancel, healthy queue and
focus restoration. Waiting animations pass both browsers at those widths,
including static reduced motion, measured segments, local timers and fixed
panel height. These are synthetic API tests, not real funded admission proofs.

Earlier attempts remain preserved. Failures included the isolated CSP path,
fixture PRF relying-party mismatch and a broad WebSocket fixture intercepting
Next development transport. The latter now intercepts only the engine origin.
No failed report was overwritten or relabelled as a pass. Final production-image
browser tests and public deployment evidence will be appended below.

Backup `/opt/pongit/backups/catalog-20260929T100048Z` includes fresh agent/operator
dumps and runtime configuration. All three files have SHA-verified copies under
`C:/Users/wwwle/.codex/private-backups/pongit/catalog-20260929T100048Z`.
Rollback must change compatible service images only, never overwrite current
transaction journals with these snapshots.

The progressive policies for all eight bots remain a separate, undeployed
candidate. Their contract migration, funded gameplay checks and the final
24-hour trial are not established by this UI correction.

## Final isolated production image

Web `a3383a2` built as
`sha256:735a27a8a8327de72ec3eeb134ec2c499e0eafa32031909d5caaa8c808919999`.
Reader `2e18c71` built as
`sha256:71b535e3062d143792c7fa800a1223fd43448088847aa803214327507fa3fd03`.
The isolated reader returned canonical capacity/catalogue/live views at 10:11 UTC.
It reported the actual publication outage, eight identities and no live match.

The final web image passed Chrome and Edge runs in
`artifacts/qualification/20260929/catalog-final-1`: 34 page checks, five recovery
viewport groups and five progress groups in each browser. This includes Classic
and Chaos courts, countdown, both tournament layouts, results and replay playback,
keyboard focus, touch targets, landscape, zoom and reduced motion. The page suite
also keeps the historical two-lane decoder under test; the recovery/progress
suites exercise current five-lane views. APIs and game states in these suites
are fixtures, not proof of live gameplay or hosted capacity.

The capacity preflight now has a five-second deadline. The real browser fixture
observed the error in approximately 5.4 seconds, without a passkey or transaction.
Initial catalogue failures show immediately; the grouped metadata read has an
eight-second deadline instead of compounding quiet retry windows. Confirmed and
uncertain transactions keep their existing reconciliation policy.

The production HTML, RSC, headers and assets were copied without modification to
a loopback-only fixture server. This was necessary because SSH forwarding is
administratively prohibited; no SSH policy or provider setting was changed.
Mobile and desktop captures were visually inspected. The public read-only check
is separate and cannot be replaced by these fixture results.

## Public rollout and additional race regression

The reader was deployed at 10:27:41 UTC; its new capacity route returned HTTP 200
and publication unavailability. Web `a3383a2` was deployed at 10:28:20 UTC.
Actual public Chrome and Edge checks passed the small mobile views but failed
when selecting a rival before the separate config response arrived. These
failed reports are preserved in `catalog-public-1` and `catalog-public-2`.
The failure was a UI ordering defect, not a funded admission test.

`d6170ba` makes recovery-only rival selection independent from configuration.
A healthy new challenge stays disabled until the manifest arrives. The new
regression deliberately delays config behind catalogue and proves immediate
selection without a reconnect error, passkey or transaction. Development Chrome
passed this race and all five recovery viewport groups; typecheck passed.

The deployment verification's first human-runtime hash also failed because Docker
returns the Mounts array in varying order. Three repeated reads showed identical
canonical sorted fingerprints but different unsorted ones. The human relayer
still has its September 24 start time, zero restarts and its existing image and
mounts. The failed unsorted comparison is retained in the deployment report.
No human service was updated or restarted by this rollout.

Final runtime delta `catalog-final-20260929T1031Z` is SHA-verified off VPS. It
complements, rather than replaces, the fresh 10:00 agent/operator dumps. The
initial local `gitleaks` invocation was unavailable on PATH; the explicit cached
8.30.1 executable subsequently scanned all four published commits with no leaks.

## Final public state, 10:40 UTC

The corrected web `d6170ba` is now public as
`sha256:4ff4c198a0b9ca86e091864400cf2dafce795a11e878324d4c92c1dd2aea737d`
since 10:39:06 UTC. Reader remains `2e18c71` / `71b535e3062d`.
The final isolated image passed both browsers' five recovery viewport groups,
including the delayed-config race (`catalog-final-2/recovery`). Earlier final-1
image passed 34 page checks and five animation groups per browser; presentation
and non-catalogue code did not change in the subsequent race correction.

Actual public Edge (`catalog-public-3`) and Chrome (`catalog-public-4`) passed at
360, 390, 768 and 1440 pixels: eight house bots plus the existing community agent,
pixel mode controls, no horizontal overflow, correct outage selection without
passkeys, and home/tournaments/docs HTTP 200. Catalogue display samples were
0.5 to 5.3 seconds, NOT admission or gameplay latency. No transactions were sent.
The initial Chrome public-3 run completed all UI checks but its conservative
network guard aborted one unclassified non-GET request while navigating the
remaining site; this FAIL is retained. Request-metadata instrumentation was added
without logging bodies. The subsequent Chrome run had no non-GET attempts or
runtime errors. This does not identify or retroactively pass the earlier request.

The exact 10:00 backup dumps were restored to temporary isolated databases:
67 operator public tables and four agent public tables restored successfully.
Only those scratch databases were dropped. Final runtime delta
`catalog-final-20260929T1040Z` is SHA-verified off VPS, hash
`7184ea5432002bfdede3932339289c7cf675a63d88b15cf080ca94b2d1a2abd7`.
All temporary UI/reader containers and local fixture servers from this operation
are stopped. Their evidence and prior images remain. The canonical human image,
start time and sorted mounts were unchanged across the final deployment.

At 10:37 UTC publisher balance remained 1.126185383116930335 test MON and the
controlled operator held 3641.957501328 MON. No funding transfer was made.
The pending explicit 3,000-MON authorization remains unanswered. Production
correctly reports four free lanes, zero ready arenas and publication unavailable;
there is no claim that this UI patch restored funded gameplay. Progressive bot
contracts, live synchronization, full concurrency and the unchanged 24-hour
trial remain pending. The paused funding follow-up must not launch trials yet.

Rollback: use the exact previous reader `10cfb2bff842` and web `b47e7954a1ef`
images recorded in `deployment.json`, retaining the current runtime flags and all
current databases/journals. Do not restore an old database over later operations.
The intermediate `a3383a2` image is retained for evidence but is not preferred for
rollback because its catalogue/config race is known.

Final visual check: `catalog-public-5` passed Chrome and Edge on the actual site
at all four widths, with all lazy portraits explicitly decoded before screenshots.
No runtime errors, non-GET attempts or passkey calls occurred. Earlier screenshots
taken before below-fold lazy images loaded remain preserved; they are not the
visual deliverable. Use `catalog-public-5/chrome-1440.png` for the published view.
