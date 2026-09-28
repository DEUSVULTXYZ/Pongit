# Five-lane deployment boundaries

`agent-five.compose.yaml` builds no code at startup. Pin `AGENT_FIVE_IMAGE` and
`AGENT_FIVE_POSTGRES_IMAGE` to the reviewed image digests. Use the same application
image for engines, reader, admission, maintenance, archive and sponsor. Do not
mount TypeScript overrides. The separate qualification image contains the same
source plus bounded diagnostic tools; never route public traffic to those tools.

The private project name is `pongit-five-YYYYMMDD-N`. It has no published ports.
`AGENT_PUBLIC_API=0` and sanitized metadata must keep enabled, tournamentsEnabled
and qualification evidence unset/false. A separate private proxy may expose it
only to the bounded browser fixture. A running private sponsor does not establish
qualification. Production stays on its existing project during the trial.

Private role environment files are owned by the operator, mode 0600. They contain
only each role's required connection strings and settings. Keys are separate
0600 files readable by UID 1000. The reader receives no signing key. Engines
receive only the game controller and testnet admission bridge. Admission,
maintenance, archive and sponsor each receive a different signer, checked against
their configured address before signing. The old operator key is not mounted.

Keep the original operator journal database for signer reconciliation. New
signers have distinct address-derived advisory locks; the old key retains lock
701340 and its original journal. Never copy pending journal rows into a new
database, share one scoped key between roles, or erase an uncertain operation.
The new application database holds health, observations, replays and sponsorship
intents. Create and restore-test its external volume explicitly before startup.

## Migration

`scripts/migrate-reusable-agents.ts` consumes a canonical source manifest and an
empty-seed audit created by `scripts/audit-agent-rating-seeds.ts`. It requires an
already closed, drained source, and fails if its imported revision changes. It
does not close production, approve a public release or open a delegation. Repeat
an interrupted run with exactly the same namespace, input and journal. It reuses
the old ArcadeFamily, imports the ordered ratings ledger, verifies both modes,
preserves creator/queue nonces, and retains all eight house identities. A private
fresh season is only a fixture, never a substitute for this migration.

Add the old manifest to the replacement's flat, disabled `history` array. Run an
archive-only service against each retired source until all its results are final.
The replacement archive imports historical rating corrections and finality. Old
tournament fixtures remain routed to their original authority, never re-admitted
through the new pool. Old finance and withdrawal contracts are unchanged.

## Shared replays and credential rotation

`shared-replays.compose.yaml` replaces the hand-started Hasura using its existing
network and container name. It deliberately publishes no host port and does not
create, rename or clear any database table. Before cutover, export metadata and
dump the database, verify the off-VPS hashes, and restore both into an isolated
database. Verify the `indexer.Match` retention query on that restored copy.

Inventory every consumer of the affected PostgreSQL role without printing its
environment. Prepare new 0600 environment files using a generated password. At
cutover, pause those consumers, execute the password change over the local
administrative connection, then recreate Hasura and every affected consumer from
their reviewed Compose definitions. Verify authenticated health, metadata,
indexing and retention before removing the old stopped container. Do not pass
the password in a shell command line, logs, diagnostics or Git.

Rollback reuses the new credentials and current volumes. It changes image/config
versions only; it must not restore the pre-cutover database over new transactions.
Keep old images, original encrypted backup, metadata export and all failed trials.
