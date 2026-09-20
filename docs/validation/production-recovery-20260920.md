# Compatible production deployment, 20 September 2026

At 17:52:15 UTC, production web and relayer moved from `7d35926` to
`802ae5ebfbf19d7002ef683246551d5806938df6`. This is a compatible recovery
deployment, not the opening of the new game architecture. Human, agent and
tournament admissions remain closed. No immutable contract was replaced.

## Deployed and preserved

- `/opt/pongit/current` points to `/opt/pongit/releases/802ae5e`.
- Web: `pongit-web:recovery-802ae5e`, image
  `sha256:d5ee837ba7971cb6b0e7b0b751c5f8d5701c22a6ac063142aaa9dbae377bd2db`.
- Relayer: `pongit-relayer:recovery-802ae5e`, image
  `sha256:5534c42fa681fb845f355ccd960cae0c7d8f82b0954bd40006d383037ec68de0`.
- Dependencies use the identical production lockfile. Its SHA-256 is
  `7c0ce14853d846c981388ef9f8fbef5b66d8b22eb42ebe142740e4ec763a19e0`.
- Production deployment manifests and the licensed audio files were preserved.
  The human application remains `0x78d3341e3452d7ec1add9371de3008639eed8eb0`.
- Database, indexer, Hasura, Caddy and both RPC containers were not recreated.
  No existing financial contract, balance or nonce journal was reset.
- `ROOMS_ADMISSION_ENABLED=false`, lifecycle writes and renewal held,
  independent admissions disabled, all public agent gates disabled.

The new reusable arenas are still private candidates. Publishing their service
code does not upgrade existing immutable applications or prove hosted gameplay.

## Indexer access repaired

The production Hasura source existed but tracked **zero tables**. Its only query
was `no_queries_available`, although the PostgreSQL entity tables existed. This
made V4 payout discovery and history queries fail before the deployment.

After exporting and verifying the old metadata off the VPS, fourteen existing
entity tables in schema `indexer` were tracked with their original GraphQL names:
Alert, Bet, Frame, Handicap, Match, Pair, Pattern, Payout, PayoutCandidate, Player,
RecentReplays, SeasonRating, Tournament and TournamentEntry. The database source,
credentials and data were not replaced. No anonymous or new role permissions
were added. Custom names follow the
[Hasura table metadata API](https://hasura.io/docs/2.0/api-reference/metadata-api/table-view/).

Read queries now succeed. `/api/health` reports empty payout discovery and worker
errors. The journal retains fifteen paid tasks and two no-payout tasks. This
verifies discovery/read access, not a new real-money payout or complete historical
backfill. The initially inspected index contained eleven Match records and no
PayoutCandidate records.

## Verification

- Production Next.js build passed, including 28 documentation articles,
  187 searchable sections, 60 links/images and four historical deployments.
- Real public Chrome and Edge checks: **32 passed**, across 360, 390, 768 and
  1440 pixels for home, docs, disabled Agent Arcade and disabled tournaments.
  No horizontal overflow or uncaught page exception; docs and disabled agent
  pages did not contact game APIs/nodes. Docs opens in a separate tab.
- The first browser report is retained as failed: the test looked for an exact
  sentence while the element contained a two-sentence paragraph. The corrected
  assertion uses the visible substring; no product change was needed.
- API health, configuration, leaderboards, history, tournaments, legacy history
  and payout reads return 200. Unknown documentation articles return a real 404.
  `/api/legacy/config` is not a supported route and returned 404 as expected.
- Both new containers are stable with zero restart count, relayer healthy.
- Prior source evidence remains 574 TypeScript tests and 26 targeted Solidity
  tests passed. They are not a substitute for the pending hosted qualification.

These browser checks did not sign transactions or play a match. They do not
establish Mera hardware compatibility, live command latency or 24-hour uptime.

## Backups and rollback

Before deployment, backup `20260920T173713Z` was copied off the VPS and all
85 listed files verified. The original Hasura metadata was separately verified
with SHA-256 `8f0df440e6e772e0b2c3ea0a43a1cc675408e91375e0038d3a24e0d5ecd03109`.
The post-deployment backup is `20260920T175444Z`.

Twelve unused source archives, totalling 447,053,372 bytes, were copied off the
VPS and checksum-verified before their on-VPS copies were removed. Reports,
expanded sources, volumes, production and rollback images remain. Disk usage was
79.57% of usable capacity before the build.

Rollback: point `/opt/pongit/current` back to `/opt/pongit/releases/7d35926` and
run `docker compose up -d --no-build --no-deps relayer web` in that directory.
Keep all admissions closed and retain the repaired Hasura metadata. Do not
restore an older database merely to roll back the services: the chain and nonce
journal have continued to progress. `/opt/pongit/previous` retains this release.

Private operational evidence is under `/opt/pongit/shared/recovery-802ae5e`.
Local browser evidence is under `artifacts/recovery-802ae5e-browser2`; the original
failed report remains under `artifacts/recovery-802ae5e`.

## Remaining publication blocker

At **17:56:31 UTC**, the private reusable agent arena
`0xf868bdb4669f4de471555ccadc3bac5589a3fcaa` still reported five results on its
engine but only four on Monad, with 1,030 committed batches and fifteen pending
diffs. Its failed qualification report remains failed.

The provider's publishing account
`0xB28E684815b095aB5Fb324214cfEa63d76F3d691` held
`0.706122920494194802` test MON, nonce 65991. The last observed commit cost
0.816 MON, with a 1.4592 MON fee ceiling. This supports insufficient funding as a
cause; it does not establish that every earlier failure had this cause.

The user was asked to send **2 MON on Monad Testnet (10143)** to this publisher
for one diagnostic retry. No transfer was made by the agent, no recurring
funding was authorized, and the protected manual commit endpoint was not
bypassed. Verify the actual canonical publication after funding before continuing
hosted qualification or opening admissions. All remaining final qualification
gates, including unchanged 24-hour testing, still apply.
