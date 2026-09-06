# PONGIT operations

Canonical site: https://pongit.xyz. The live deployment uses Ubuntu 24.04, Docker Compose and a dedicated SSH operator account. Keep strict SSH host-key verification and the existing SSH port when provisioning. Credentials, SSH keys and the private runtime environment are never distributed through this repository.

## Reproducible installation

`ops/provision.sh` installs Docker/Compose, enables startup and opens HTTP/HTTPS while preserving SSH on port 3333. Place a validated release under `/opt/pongit/releases/<commit>` and its private configuration at `/opt/pongit/shared/runtime.env` (mode 600). Symlink the release's `.env` to that file and configure the fields in `.env.example`. Deployment and administrator private keys belong in a separate operator environment, never in web or relayer containers.

For a fresh V1 deployment use `npm run deploy`. For the V2 migration, use `npx tsx scripts/deploy-v2.ts` with `LEGACY_DEPLOYMENT_FILE` pointing to the V1 manifest and `DEPLOYMENT_FILE` pointing to a new V2 manifest. Retain all deployment/binding receipts. Do not rerun deployment for an application-only update. For Arcade/V3 use `scripts/deploy-v3.ts` with the V2 manifest as `LEGACY_DEPLOYMENT_FILE`. It binds ArcadeSessions to GameV3, seals the market and two vault modules, and embeds the complete V2/V1 manifest chain.

For V4 use `scripts/deploy-v4.ts` with the V3 manifest as `LEGACY_DEPLOYMENT_FILE`; see [automatic wallet payments](PAYMENTS_V4.md). The live V4 indexer uses a dedicated private gateway: `INDEXER_RPC_URL=http://rpc-indexer:8545 INDEXER_CHUNKED_RPC=true npm run indexer:configure`. This batches historical ranges with rate-limited, provider-compatible subrequests and contract-specific deployment blocks. For earlier deployments run `INDEXER_RPC_URL=http://rpc:8545 npm run indexer:configure`. The generator sets explicit RPC synchronization, 99-block batches and a 1.5-second poll interval. The Envio image includes root certificates and a 120-second RPC query timeout for backfill through the shared gateway.

Build the frontend for its final API/WS URLs and RP ID. Run `docker compose build` and `docker compose up -d`. The fixed Compose project name `pongit` preserves volumes across releases. Caddy obtains and renews Let's Encrypt certificates; ACME data is persistent. Public ports are 80/443 and SSH 3333. PostgreSQL, Hasura, RPC and relayer remain on the private Docker network.

PostgreSQL retains the original `pong_relayer` journal and all generation-specific indexer databases. V4 uses `pong_indexer_v4_1ff69df6_scoped`. Its superseded staging database is retained. Archived V3 uses `pong_indexer_v3_7b54521d`; the V2 database `pong_indexer_v2_47dba35e` is preserved. Both are owned by the restricted indexer role. Hasura never receives journal credentials. Earlier development databases and `*-superseded.json` manifests remain archived. Do not reuse a journal with another chain or signer. Register compatible deployment migrations through the versioned journal logic instead of erasing history.

## Accounts and funding

Only Monad Testnet 10143 is allowed outside local Anvil. Sponsorship, demonstration credits, liquidity and prizes use test MON. The daily sponsorship ceiling was removed at the owner's request on September 6, 2026: **`RELAYER_DAILY_BUDGET_MON=0`**. A positive value restores the optional daily ceiling. The gas-price cap remains 200 gwei. Balance reservations count maximum gas and transferred value for signed/pending jobs, then actual receipt fees and transferred value on confirmation. Outstanding reservations survive midnight UTC.

Value transfers retain a waiting window when the sender risks entering the Monad reserve. A sufficiently funded sender avoids that wait while reserving 10 MON, all existing commitments and a conservative 30-million-gas allowance before estimation. See [Monad reserve semantics](https://github.com/category-labs/monad-revm#reserve-balance-precompile-0x1001). Already signed jobs always recover with the same bytes and nonce.

To grant functional roles to a Mera account, run from a private operator environment:

```sh
npx tsx scripts/admin.ts grant 0xMERA_ADDRESS
# Use revoke to remove the same functional roles.
```

This requires `ADMIN_PRIVATE_KEY`, `RPC_URL` and the intended deployment manifest. It does not grant root administration or treasury ownership. Fund the administrator separately for console transactions. Transferable roles can change onchain; replacing an immutable treasury requires redeployment.

## Backup, restore and restart

Install `ops/pongit-backup.service` and `.timer` under `/etc/systemd/system` and enable the timer. It invokes `ops/backup.sh` daily around 03:30 UTC with seven-day retention. Database dumps, private configuration, manifests and the release reference are saved under `/opt/pongit/shared/backups` with restricted permissions.

Copy backups off the VPS over SSH to protected storage. The configured Windows task, **PONGIT offsite backup**, pulls the latest backup at 05:40 local time and at login into the operator's ACL-protected `.ssh/pongit-secrets/backups` directory. That copy requires the computer, network and user session to be available. The VPS timer operates independently.

Before restoring, verify the manifest and signing account. Test dumps in temporary databases first. Run explicitly:

```sh
bash ops/restore.sh /opt/pongit/shared/backups/TIMESTAMP
```

The script stops writers, verifies checksums and restores the databases present in the backup before restarting services. An old database does not rewind the chain: reconcile already included receipts before resuming an old journal.

Check `docker compose ps`, service logs, `https://pongit.xyz/api/health`, a ladder and a replay. Docker restarts services after a VPS reboot. Preserve SSH access and its configured socket/port.

## Application rollback

Use `bash ops/rollback-v4.sh COMMIT` for the current V4 application. Scripts for V2/V3 are retained for their archived operations. The target release must already exist. The script rejects older generation binaries or different immutable contract addresses, backs up data, builds the target, stops the relayer, switches `/opt/pongit/current` and restarts web/relayer. It preserves the journal and volumes. Contract transactions cannot be rolled back by changing application code.

Keep the previous release and images. Never attach a replacement contract's journal to an old deployment. Additive migrations support compatible application rollback; an incompatible migration needs its own restore procedure. Indexer dependency/image updates can be applied separately with `docker compose up -d --no-deps indexer` after verifying the target configuration and preserved database.

## Services and submissions

The live site uses public Monad RPC and self-hosted Envio. `ALCHEMY_RPC_URL` supports a future service integration but no current Alchemy traffic is claimed. Bounties are secondary to the functional game. See [V4 payment evidence](PAYMENTS_V4.md), [V2 delivery evidence](V2_DELIVERY.md) and [V2 submissions](QUESTS_V2.md).
