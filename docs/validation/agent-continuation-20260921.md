# Agent authority continuation, 21 September 2026

These contracts and reader changes are candidates, not deployed replacements.
Human play and the public agent testnet preview keep their existing authority.
The private `ed599…` deployment remains a fresh test season and must not replace
the public catalogue, ratings or pending requests.

## Preserved state

`ContinuingAgentChallenges` imports directly from the code-hash-pinned queue
registered by the old pool. It retains request IDs, ordering, status, timestamps,
grant digests and observed nonce counters. It reuses the original ArcadeFamily,
so a still-valid two-hour grant needs no new root signature. Challenge signatures
remain bound to their queue's EIP-712 domain and cannot replay in the replacement.
Every page requires closed source admissions. An active old duel blocks import;
it is never cloned. Requests cancelled in an old tab after import are synchronized
before new admission. Such a cancellation cannot concede an already admitted
duel in the new pool. A revoked or expired grant remains unusable.

`ContinuingAgentQualifications` retains the selection cursor and both per-mode
retry deadlines. Historical trials stay at their original authority. A late
correction can extend an inherited retry, until an independent new verdict
supersedes that mode. The migrating catalogue now resolves inherited eligibility
against the source immediately, rather than waiting for a keeper to copy a
revoked qualification. A permissionless synchronization mirrors its evidence;
it cannot overwrite a newer independent verdict.

`ContinuingAgentInstancesPool` initializes logical match numbering from the
closed source's counter. Its catalogue requires both old lanes empty and checks
that the counter remains unchanged throughout import. This is constructor-only
logic: its runtime remains the balanced pool's 32,720 bytes, below the existing
32,768-byte allowance. Ledger identities were already full-reference hashes,
not these sequential match numbers; this change preserves numbering, rather
than repairing a nonexistent ledger-key collision.

An optional, bounded `history` manifest lists retired, read-only authorities.
Old match URLs query their original pool, epoch and rules. Missing publication
is an error, never an invented result or a live connection to a retired node.
Historical arenas cannot become current capacity, signing targets or added
browser WebSocket origins. Nested/duplicate authorities, ambiguous arenas,
human-space arenas and enabled historical manifests are rejected. Unknown
fields are removed recursively before returning configuration to a browser.

## Validation and actual source inventory

Local validation passed 194 Solidity tests in 11 suites, including inherited
cases, root TypeScript and 24 targeted TypeScript tests. These tests exercise
contract harnesses and synthetic readers, not a hosted authority migration.
The complete linked artifact graph passes runtime and creation limits; the
physics arena remains 24,516 bytes. A final constructor-comment-only rebuild
does not change its behavior. Reports are under
`artifacts/qualification/20260921/agent-continuation`.

The first extended inventory failed because its diagnostic incorrectly compared
a hashed ledger identity with the pool's sequential counter. Its partial report
is retained as `public-migration-draft-2.json`. Corrected inventory 3 passed at
canonical Monad block 64536060: nine identities, match counter 85, 84 published
ledger entries, no ranked entries/registered ranking players, and 28 non-final
results. Requests 3 and 4 were waiting at that block. The source remained open,
with tournament 4 incomplete, so `migrationReady` correctly remains false.
Zero ranked entries at this observation is not permission to replace the season
or ignore pre-seeded repeat state; the ledger migration still needs validation.

At 19:55 the shared indexer's persisted progress and source target were both
64534763, with 624 events. This proves catch-up to that observed target, not
availability of every retained replay. The private controller exited at its
original 19:17 bound; its recovery keeper exited 124 at 20:02:30, its original
four-hour bound. No old deadline was extended.

## Remaining before a public replacement

Complete verified ratings/repeat state and historical result correction handling,
deployment integration, index bindings, real concurrent copies and browser human
controls. Preserve the current season and both waiting challenges at the actual
cutoff, not merely this inventory block. Qualify capacity/publication reserve,
community Chaos, full tournament coverage and the unchanged 24-hour run. No
current source gate or public metadata has been changed by this candidate work.

## Final bounded private operation, 21 September 2026

The corrected private house controller run 6 completed four sequential hosted
games on arena `0x515b…d960`, epoch 1, before its fixed 21:20 UTC deadline. All
four were captured and published by the contract, with scores 2–5, 3–4, 4–3
and 3–4. The hosted node remained healthy with no pending diffs; the private
database reported every engine job as observed. This proves a four-game
sequential copy and publication path, not two simultaneous games or a public
capacity guarantee.

The fourth public Chaos championship was independently checked at canonical
block 64540334: all 28 fixtures are resolved and the pool result records match
the tournament publication. The report is `tournament4-canonical.json`.

The source rating ledger was audited from its confirmed creation nonce through
the migration seal. Ten canonical owner transactions were checked (nonces
2935–2944), with no `seed` or `seedPairCounts` calls; the ledger contains no
ranked players or results at the seal. The candidate `ContinuingAgentRatings`
replays the ordered ledger and preserves timestamps, seasons, repeat counters,
late corrections and atomic rebuilds. Its 11 tests and the three existing
rating tests pass. This audit is evidence for this source deployment only; it
does not authorize replacing the live public catalogue.

The bounded services, tournament verifier and seed audit were stopped after
their reports completed. A final operator/private database and state backup
was created as `house-continuation-20260921T2110Z`; all seven file hashes were
copied and verified off VPS. The private arena remains a closed qualification
resource and was not promoted. Human play and the public testnet preview were
left untouched.
