# Pile locale

Les commandes ci-dessous supposent une première installation, Node 24+, Foundry et Docker. Les clés et mots de passe cités sont publics et destinés uniquement à une machine locale. Ne jamais financer la clé Anvil sur un réseau public.

## 1. Contrats et base

```sh
npm ci
npm run bootstrap
npm run contracts:build
npm run abi
docker run -d --name pong-postgres -p 127.0.0.1:15432:5432 -e POSTGRES_USER=pong -e POSTGRES_PASSWORD=pong-local-only -e POSTGRES_DB=pong -v pong-dev-postgres:/var/lib/postgresql/data postgres:17-alpine
```

Dans un terminal dédié :

```sh
anvil --host 0.0.0.0 --port 8545 --block-time 0.3 --silent
```

Le bind `0.0.0.0` permet à Docker de joindre la chaîne ; l'utiliser uniquement sur une machine de développement dont le pare-feu bloque les accès entrants à 8545. Aucun Anvil dans la pile VPS testnet.

Créer `.env` à partir de `.env.example`, puis utiliser :

```dotenv
RPC_URL=http://127.0.0.1:8545
ALCHEMY_RPC_URL=
RPC_FALLBACK_URL=
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYMENT_FILE=deployments/local.json
DATABASE_URL=postgres://pong:pong-local-only@127.0.0.1:15432/pong
ADMIN_ADDRESS=
TREASURY_ADDRESS=
LOCAL_DEV=true
ALLOWED_ORIGIN=http://localhost:3000
INDEXER_RPC_URL=http://host.docker.internal:8545
INDEXER_GRAPHQL_URL=http://localhost:18080/v1/graphql
HASURA_ADMIN_SECRET=pong-local-indexer
```

```sh
npm run deploy
npm run indexer:configure
```

La réutilisation du compte admin/sponsor est une commodité locale : éviter les appels admin pendant que le relayer envoie des transactions. Sur testnet, les comptes doivent être distincts.

## 2. Indexer Linux

```sh
docker run -d --name pong-hasura -p 127.0.0.1:18080:8080 -e HASURA_GRAPHQL_DATABASE_URL=postgres://pong:pong-local-only@host.docker.internal:15432/pong -e HASURA_GRAPHQL_ADMIN_SECRET=pong-local-indexer hasura/graphql-engine:v2.48.6
docker build -t pong-indexer:local indexer
docker run -d --name pong-indexer-v1 -e ENVIO_PG_HOST=host.docker.internal -e ENVIO_PG_PORT=15432 -e ENVIO_PG_USER=pong -e ENVIO_PG_PASSWORD=pong-local-only -e ENVIO_PG_DATABASE=pong -e ENVIO_PG_SCHEMA=indexer -e HASURA_GRAPHQL_ENDPOINT=http://host.docker.internal:18080/v1/metadata -e HASURA_GRAPHQL_ADMIN_SECRET=pong-local-indexer pong-indexer:local
```

Sur Linux natif, ajouter `--add-host=host.docker.internal:host-gateway` aux deux conteneurs. Vérifier que les services de développement sur l'hôte sont accessibles par cette passerelle ; Docker Desktop fournit ce nom automatiquement. Le démarrage Envio doit annoncer les handlers chargés et le passage à l'indexation en temps réel. Hasura reste privé.

## 3. Site et relayer

Dans deux terminaux séparés :

```sh
npm run relayer
```

```sh
npm run dev
```

Ouvrir http://localhost:3000. Dans « Connect passkey », choisir « Local test player » pour simuler chaque joueur sans authentificateur. Utiliser trois profils/contextes de navigateur pour deux joueurs et un spectateur. « Local test operator » ouvre l'administration du déploiement Anvil.

```sh
npm run test:e2e
npm run test:tournament
npm run test:browser
npm run test:replay
npm run test:recovery
npm run test:backup
npm run benchmark:local
```

`test:browser` utilise Chrome installé sur Windows ; définir `CHROME_PATH` ou installer Chromium Playwright sur les autres systèmes. `test:replay` attend `MATCH_ID` (3 par défaut), `DEPLOYMENT_FILE` et `E2E_API_URL` si différents. `test:recovery` crée sa propre chaîne et une base locale séparée, puis provoque une coupure du processus avant inclusion. Les bases de restauration et de reprise sont conservées pour inspection.

Si Anvil est réinitialisé ou les contrats redéployés, créer un nouveau journal PostgreSQL et une nouvelle indexation. Ne pas appliquer un ancien checkpoint à une nouvelle chaîne portant les mêmes adresses. Le relayer refuse un journal lié à un autre manifest/signataire.
