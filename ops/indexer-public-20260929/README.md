# Public replay index, 29 September 2026

Envio 3.9.0 refuses adding or rebinding contracts in an initialized schema.
Do not bypass that check or run `envio start -r`. Each indexer below has one
writer and an independent checkpoint, in database `reusable_shared_indexer14`:

- `legacy/`: exact predecessor source/config, schema `indexer`.
- `live.yaml`: new agent pool, schema `agents_live_20260929`, starts at 66549863.
- `backfill.yaml`: current human ledger plus new pool, schema
  `arcade_five_20260929`, starts at 64393211. Catch-up does not delay live agents.

For live/backfill, build the repository `indexer/Dockerfile`, with the selected
YAML as `config.yaml` and these two generated deployment bindings in `src/`.
Package the reviewed `ops/pin-envio-rpc-concurrency.mjs` as usual. The legacy
directory is a complete public build context, including its original handlers.
No runtime source mounts are needed. Credentials stay outside these contexts.

Use `ENVIO_HASURA=false` for **all three** services: automatic tracking would
replace the shared query surface with a single source schema. After initialization,
apply `ops/shared-indexer-views.sql`. Hasura tracks `pongit_history.Match` and
`pongit_history.RecentReplays` with their unchanged GraphQL names. Preserve the
existing source connection and unrelated metadata. The private current metadata
and Compose are backed up with the release.

The views select the most recent canonical indexed revision for duplicate full
match references and enforce the shared three-match replay policy. They never
rewrite source entities or resurrect already pruned frames. Envio rollback still
owns every source row. Tests against PostgreSQL cover duplicate references,
cross-source retention, corrections and no resurrection; all fixture writes roll
back. Live HTTP replay checks include real matches 173 and 175.

Reversible operations: stop a specific indexer, restore its previous image and
matching source configuration, or restore the previous Hasura **metadata**.
Never overwrite a current database with a backup. Keep each schema and its
checkpoint. Removing a view does not remove the underlying history.
