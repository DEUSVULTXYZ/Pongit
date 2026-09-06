# Local development stack

These commands assume a fresh development installation with Node.js 24+, Foundry and Docker. Shell examples use POSIX environment-assignment syntax; use `$env:NAME="value"` in PowerShell. The Anvil key and local passwords below are public test fixtures. Never fund that key on a public network.

## 1. Contracts and database

```sh
npm ci
npm run bootstrap
npm run contracts:build
npm run abi
npm run abi:v2
docker run -d --name pong-postgres -p 127.0.0.1:15432:5432 -e POSTGRES_USER=pong -e POSTGRES_PASSWORD=pong-local-only -e POSTGRES_DB=pong -v pong-dev-postgres:/var/lib/postgresql/data postgres:17-alpine
```

In a separate terminal:

```sh
anvil --host 0.0.0.0 --port 8545 --block-time 0.3 --silent
```

Binding Anvil to `0.0.0.0` allows Docker to reach it. Use this only on a development computer whose firewall blocks incoming access to port 8545. Anvil is not part of the public VPS stack.

Create `.env` from `.env.example`, then configure:

```dotenv
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545
ALCHEMY_RPC_URL=
RPC_FALLBACK_URL=
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYMENT_FILE=deployments/local-v2.json
DATABASE_URL=postgres://pong:pong-local-only@127.0.0.1:15432/pong
ADMIN_ADDRESS=
TREASURY_ADDRESS=
LOCAL_DEV=true
ALLOWED_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws
NEXT_PUBLIC_RP_ID=localhost
INDEXER_RPC_URL=http://host.docker.internal:8545
INDEXER_GRAPHQL_URL=http://localhost:18080/v1/graphql
HASURA_ADMIN_SECRET=pong-local-indexer
```

Create the legacy contracts first, then V2 on the same local chain:

```sh
DEPLOYMENT_FILE=deployments/local-legacy.json npm run deploy
LEGACY_DEPLOYMENT_FILE=deployments/local-legacy.json npx tsx scripts/deploy-v2.ts
npm run indexer:configure
```

The new V2 manifest includes its V1 reference. Reusing the Anvil account as sponsor/admin is a local convenience: do not send direct admin transactions while the relayer uses that account. Testnet uses separate accounts.

## 2. Linux indexer

```sh
docker run -d --name pong-hasura -p 127.0.0.1:18080:8080 -e HASURA_GRAPHQL_DATABASE_URL=postgres://pong:pong-local-only@host.docker.internal:15432/pong -e HASURA_GRAPHQL_ADMIN_SECRET=pong-local-indexer hasura/graphql-engine:v2.48.6
docker build -t pong-indexer:local indexer
docker run -d --name pong-indexer-v2 -e ENVIO_PG_HOST=host.docker.internal -e ENVIO_PG_PORT=15432 -e ENVIO_PG_USER=pong -e ENVIO_PG_PASSWORD=pong-local-only -e ENVIO_PG_DATABASE=pong -e ENVIO_PG_SCHEMA=indexer -e HASURA_GRAPHQL_ENDPOINT=http://host.docker.internal:18080/v1/metadata -e HASURA_GRAPHQL_ADMIN_SECRET=pong-local-indexer pong-indexer:local
```

On native Linux add `--add-host=host.docker.internal:host-gateway` to both containers and make the host development services reachable through that gateway. Docker Desktop provides this name automatically. Envio should load the handlers, backfill both deployments and reach live indexing. Hasura remains private. Production uses separate databases and roles, unlike this disposable local setup.

## 3. Site and relayer

Run in separate terminals:

```sh
npm run relayer
```

```sh
npm run dev
```

Open http://localhost:3000. In **Connect passkey**, choose **Local test player** to simulate an account without an authenticator. Use separate browser contexts for two players and a spectator. **Local test operator** opens Anvil administration. These controls are disabled outside local development.

```sh
npm run test:e2e
npm run test:tournament
npm run test:browser
npm run test:replay
npm run test:recovery
npm run test:backup
npm run benchmark:local
```

Browser tests can use Chrome installed on Windows; set `CHROME_PATH` or install Playwright Chromium elsewhere. Configure `PONG_TEST_URL` and `PONG_TEST_API` for browser tests on nondefault ports; script-based flows use `E2E_API_URL`. Replay checks accept `MATCH_ID` and the intended `DEPLOYMENT_FILE`. Recovery tests create an isolated chain/database and interrupt the relayer before inclusion; inspect their required environment before running them against a different local setup. Testnet write tests require explicit opt-in and funded test accounts.

If Anvil is reset or contracts are redeployed, use a fresh journal and indexer checkpoint. Never attach an old checkpoint to a new chain that happens to reuse the same addresses. A compatible V1-to-V2 migration preserves the journal using the registered manifests; a chain reset does not.


## Arcade (V3)

With a fresh local V1/V2 deployment on the same running Anvil chain, preserve the V2 manifest and deploy the arcade registry and GameV3:

```sh
cp deployments/local.json deployments/local-v2.json
LEGACY_DEPLOYMENT_FILE=deployments/local-v2.json DEPLOYMENT_FILE=deployments/local.json npx tsx scripts/deploy-v3.ts
npm run indexer:configure
```

Use a fresh indexer database for the three-generation configuration. Preserve the relayer journal when migrating the same chain and signer. Use a separate funded local sponsor account if admin tests submit direct transactions. The V3 registry must be bound and the financial links sealed; the deploy script performs and verifies those steps.

The arcade browser flow uses real Mera SDK calls with virtual Chromium PRF authenticators. Configure `PONG_TEST_URL` and `PONG_TEST_API` for your running stack, then run `npx playwright test arcade.spec.ts v2.spec.ts mobile-performance.spec.ts`. `tests/social.integration.ts` uses `E2E_API_URL`, `E2E_WEB_URL` and `SOCIAL_TEST_DATABASE_URL` for its isolated local database. It must never target a production journal.

When building a local production image, set `NEXT_PUBLIC_WS_URL=ws://localhost:4000/ws` (including `/ws`) and the corresponding API/RP values. Firefox and WebKit audio tests require Playwright browser runtimes and a functioning audio backend; headless Linux Firefox may need a PulseAudio null sink. Browser emulation does not establish physical passkey synchronization or speaker quality.
