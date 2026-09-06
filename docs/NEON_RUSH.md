# Neon Rush operations

The game remains on Monad Testnet (10143), with the existing V4 contracts and financial rules. This release changes the input transport, presentation, audio, and indexed replay retention. There is no Interlude or Vercel cutover.

## Input transport

`POST /inputs` acknowledges a signed `Input` plus an EIP-712 `InputIntent` sequence. The browser does not wait for the transaction receipt before sending a release or reversal. The persistent journal keeps one signed/unconfirmed input per player and the latest unsigned intention. Replaced jobs end as `superseded`; their nonces are not consumed. Failed commands refresh the cursor and re-sign the current intention.

Simulation/signing, broadcasting, receipt observation, match reads, and maintenance no longer share one blocking loop. The broadcaster sends only persisted, immutable transaction bytes; slow send responses do not block the next nonce allocation. If an unsigned direction changes during simulation, the relayer may reuse the catch-up estimate only for the same deployment, match, player, and input nonce. GameV3 assigns direction **after** collision catch-up. An extra 25,000 gas allowance covers changing a zero direction to a nonzero direction and signature calldata. This does not add any financial permission.

Input and receipt traffic use separate bounded per-IP budgets so eight players behind one NAT do not consume the general API allowance. Match creation, financial operations, and authentication retain the general limit. The daily sponsor ceiling remains disabled; balance and gas-price checks remain active.

The court reconstructs the paddle from confirmed state and relevant pending inputs. Its monotonic preview is bounded to 600 ms and 108 logical units; it pauses when observations are stale. Network details distinguish HTTP acknowledgement, queue, broadcast, receipt observation, snapshot age, and visual correction. This is not instant chain confirmation.

## Replay retention

Envio maintains `RecentReplays` across V1–V4 and both modes. Each player retains the latest three played, ended matches. A replay survives while either participant retains it. Unstarted cancellations do not consume a slot. Only `Frame` and `Handicap` records are pruned; results, scores, ratings, tournaments, bets, payout candidates, payouts and private notes remain.

The migration uses a fresh RPC reindex in a separate PostgreSQL database. Compare every unchanged financial/competition entity, common result fields, and the retained-frame union before switching. `GET /replay/:id` and the legacy equivalent return HTTP 410 for a retired replay. `GET /replay-status/vN:id` exposes only replay availability; private notes stay encrypted.

## Deployment and rollback

1. Run contract tests, TypeScript checks and the 20,000 differential cases. Run service/browser tests through `ops/test-sandbox.yaml` on the VPS with a private `.sandbox.env`, isolated chain, database, network and resource limits.
2. Back up through `ops/backup.sh`, verify the dumps and the protected offsite copy. Wait until production matches and tournaments finish before replacing services.
3. Build an application release from the audited Git commit. Keep both the technical release and the final Neon Rush release under `/opt/pongit/releases`.
4. Stop the old and shadow indexers before switching `INDEXER_DATABASE` to the verified database. Start the standard Hasura/indexer services against that database; never run two indexers against it.
5. Stop the old relayer before starting the replacement. Keep the original deployment manifests and the unique transaction journal/signing lock. Verify HTTPS, confirmations, replay availability and payout recovery.
6. Use `bash ops/rollback-v4.sh COMMIT` to return to a compatible application release. `APP_PROTOCOL_VERSION=2` prevents rollback to binaries that do not understand the new input and retention APIs. Do not restore an old database while transactions continue to arrive.

The production database stays private. Backup retention is seven days; replay retention does not limit transaction-journal, accounting or backup growth. Inspect their sizes separately. Never use a global Docker volume prune: preserve other projects and production/rollback images.

## Evidence

Validation reports are published separately once measured. Local-chain timings must not be described as Monad timings. Audio analyser measurements verify generated browser output, not a user's physical speakers or headphones. Physical passkey synchronization remains a separate device test.
