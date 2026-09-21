# House instances candidate and capacity handoff, 21 September 2026

Update at 16:25 UTC: the owned capacity handoff succeeded. The sole public
keeper released `1c5…` epoch 2 at 16:10:03, transaction
`0xa03424969e223b466368671edc07c355d5c89e0c678e4cdd942181878ae24c09`,
block 64491047. Canonical verification found status None and a finalized root
containing six results. The retirement policy remains in place.

The private candidate `dde8…` epoch 1 then actually opened in transaction
`0xdaf08211235c551f28751a8d2aacdac319ae2cdc18b7eee94c59e1646ed6e19a`,
block 64491278, and became hosted/available at 16:11:35. The selected-arena
readiness check passed at 16:11:40. The other two candidate arenas remain
unopened. This proves one admission, not concurrent capacity or continuity.

The private services use the separate database `house_instances_20260921` on
the existing agents PostgreSQL container. No public rows or journal were copied
over it. The operator still uses the original database and advisory lock 701340.
The recovery-only keeper has no publication budget and cannot start new games.
Bounded trial 1 has captured an actual Classic 0:7 result; its Chaos match is
still being observed. See [publication and cadence evidence](agent-publication-rate-20260921.md).

The public preview still uses its original immutable authority. Its house bots
remain exclusively reserved for tournaments until the replacement is qualified
and migrated. Human Classic/Chaos and the live agent tournament remain open.

## Candidate implementation and deployment

Source `1af79ad` adds official house instances with separate friendly/qualification
state and preserves tournament participation. Its local validation passed root
TypeScript, the complete 646-test TypeScript suite and 89 relevant Solidity tests.
The subsequent retirement-policy change `0116c96` passed root TypeScript and the
complete 647-test suite. There are 17 candidate-pool Solidity cases. These are
authority/transport tests, including terminal-state harnesses, not real matches.

The first inline-library build failed the unchanged 32 KiB pool budget at 33,687
bytes. The linked helper version is 32,603 bytes, with a 1,237-byte helper and
24,516-byte agent arena. Both failed and successful reports are preserved under
`artifacts/qualification/20260921/house-instances`.

The private testnet deployment completed at 15:27:13 UTC:

| Contract | Address |
| --- | --- |
| Pool, authority version 2 | `0xed5998627c21188db01750ea03b2309311435f5b` |
| Catalogue | `0xf6647b9bad7e4329b46a6c0019ec387d8bc4bd24` |
| Tournaments | `0x18c537165368e48c0ffc03e40800469a72e0b13d` |
| Published ratings | `0x53e1d68929932beaeaf42cd40844d1363a521cdc` |
| Qualifications | `0x37f2b50d880454a5edaf5e48c35a24e6b02f9791` |
| Arcade family | `0x1326ffc0a90ead2d22244f0248e78de2551eb621` |
| Challenges | `0x17cf9a6d528462531b621cbb9b4b1f9d5a5c1a5a` |
| Result verifier | `0x8c080065e19a9cd4e5aafbd4b536465ef58e5e23` |

Registered empty arenas are `0xdde88fadb426e6e26fa58cbef3ad98de4946b64e`,
`0x515b86ad589ecd352e0536d106d4bf154d1dd960` and
`0xc9641ff6d5477d13e6000aa68e762ba6c8b69b71`. Registration is not provider capacity.
Both admission gates remain false. The 51 successful receipts used 102,825,650
gas in total and cost 10.4882163 test MON. No financial market was deployed.

Opening simulations at 15:36:29 UTC, observation block 64484495, all failed with
`ValidatorAtCapacity()` / `0xe90bcd65`. No opening transaction was sent and no
hosted instance, human-bot match or 24-hour qualification is claimed.

## Reusing owned capacity

The sole public keeper now runs the `0116c96` step and two pinned helper files
over the existing `progress-4e90490` image. Its step SHA-256 is
`275339fff558c08d4f6cfa9fc025568c9d60a5c16bd1b5faa440be4cfb977999`.
The change was applied at 15:35:11 UTC without restarting the engine controllers,
reader, sponsor, web or human backend. Its original state and nonce journal remain
in use; no second keeper was started.

`metadata/renewal-policy.json` excludes only the already-closing public agent
arena `0x1c5ec4b86149249e0b1a24aa2605eda6cb3f267b` from new openings. Its epoch 2
release deadline is 16:09:21 UTC. The keeper still captures, releases, seals and
recovers it normally. The policy neither forces closure nor erases uncertain
transactions. At 15:35, `7fb…` epoch 2 continued match 50 and `f868…` epoch 3 was
available. Private admission must wait for actual release and successful hub
acceptance; no capacity count is inferred from this policy.

Rollback removes the policy and these source mounts from the backed-up Compose
configuration, then replaces only the keeper using its same journals. Do not
reopen the retired arena if a new candidate has already consumed its capacity.
Never restart a private keeper against these public arenas.

## Replay index repair

The live engine and reader had the correct shared index URL and matching private
admin credential, but Hasura exported a `default` source with zero tracked
tables. Its only GraphQL field was `no_queries_available`; requests for `Match`
failed even though PostgreSQL contained `indexer.Match` and recorded replays.

After a verified off-VPS metadata backup, an additive `pg_track_table` operation
exposed the existing table as `Match` at 15:29:20 UTC. No table, row, permission or
public endpoint was created or deleted. The actual retention query returned
HTTP 200 with a row. There were zero `Reconciliation pending` messages in the
engine log from 15:30 through the 15:37 check. The shared index is still catching
up; missing indexed matches remain honestly marked `indexing`, not pruned.

## Actual capacity and controls, 16:30 UTC

The keeper released retired public arena `1c5…` epoch 2 at 16:10:03, transaction
`0xa03424969e223b466368671edc07c355d5c89e0c678e4cdd942181878ae24c09`,
canonical block 64491047. The owned slot then admitted private arena `dde…`
epoch 1 at block 64491278, transaction
`0xdaf08211235c551f28751a8d2aacdac319ae2cdc18b7eee94c59e1646ed6e19a`.
Its hosted node was available at 16:11:35. The other two candidate arenas remain
unopened. The public retirement policy must not reclaim this slot.

Private controller trial 1 passed Classic 0:7 and Chaos 2:6 at five minutes, with
both results published and both controllers qualified for both modes. A separate
synthetic human then passed 100 controls, lost-response reconciliation, injected
429 recovery, owner revocation and renewal. Its concession result was published
0:6. Reports distinguish simulation of controller reload from a real browser
reload and a physical passkey ceremony; neither is claimed here.

The private services use `house_instances_20260921`, a separate database, and
the same original operator nonce authority. The recovery-only keeper is bounded
until approximately 20:01 UTC and sends no autonomous new admissions. The sole
engine controller is bounded until approximately 19:17 UTC. The private public
admission gate remains false; only the owner's explicit trials are open.

The experimental 1,500 ms maintenance interval is **not deployed publicly**.
Its control p95 of 1.31 s and observed Chaos processing gap require more work.
See [publication and cadence evidence](agent-publication-rate-20260921.md).
The public controller received only compatible publication-health handling,
retaining its 300 ms interval and existing spectator fixes.

## Backups and remaining gates

Before deployment, operator and agents database dumps and configuration were
verified off VPS (`house-instances-before-20260921T1523Z`). After deployment,
new candidate private state, the operator dump and public configuration/state
were verified off VPS (`house-instances-deployed-20260921T1536Z`). The original
Hasura metadata is in `agent-replay-metadata-20260921T1531Z`; directory names are
backup identifiers, not an event-time source. No secret is included in this repo.
The final keeper policy, mounted sources, Compose configuration and journal
state were also verified off VPS in `house-instances-retirement-20260921T1540Z`.
After the actual private trials, `house-validation-20260921T164759Z` refreshed
the three relevant databases and protected state/configuration, with SHA-256
verification off VPS. Its incomplete first tar attempt is retained separately
from the successful replacement.

The private namespace is `reusable-agents-20260921-1`; source/artifacts are in
`/opt/pongit/tests/arcade-release-20260919/house-instances-1af79ad`. The bounded
deployment container exited successfully. The separately bounded private roles
described above now own this candidate. Continue through the same operator
journal and lock 701340; never start a competing engine writer.

Still required: actual hosted publication of concurrent house instances and
browser controls; preserving old identities, community registrations,
ratings, pending requests and contract-qualified historical routes during public
migration. This candidate intentionally has a fresh private season and new house
addresses; its deployment record must not replace production metadata directly.
Classic championship 3 now has 28 canonically cross-checked published results.
Remaining release gates include Chaos championship 4, the missing Chaos coverage,
shared replay catch-up, reserve/rotation and the unchanged 24-hour trial.
