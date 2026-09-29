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
