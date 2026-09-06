# PONGIT — every point has a receipt

Jeu web 1v1 dont la physique, les scores, les résultats et l'ELO sont calculés en Solidity. L'interface Next.js prédit le rendu, Mera gère les passkeys, le relayer paie le gas et Envio reconstruit les historiques. Paris LMSR, coffre MON, tournois et administration sont inclus. **Local et Monad testnet uniquement.**

Site : **https://pongit.xyz**. Contrats déployés sur Monad Testnet (10143), hébergement VPS avec Docker et certificats Let’s Encrypt automatiques. Voir le bilan pour les validations et limites. Les quêtes restent facultatives et les candidatures ne sont pas validées par les organisateurs.

## Démarrer et vérifier

Prérequis : Node.js 24+, npm, Git, Foundry (`forge` et `anvil`), Docker Compose. L'indexer Envio s'exécute sous Linux dans Docker, y compris sur Windows. Les deux fichiers package-lock fixent les dépendances JavaScript ; `npm run bootstrap` installe le commit fixé de forge-std.

```sh
npm ci
npm run bootstrap
npm run contracts:build
npm run abi
npm run typecheck
npm test
npm run test:differential
```

Pour lancer toute la pile locale : [guide local](docs/LOCAL.md). Pour le VPS Linux : [déploiement et exploitation](docs/DEPLOYMENT.md). Le site propose **Play**, **Live**, **Ladder**, **Tournaments**, **Archive** et une console **Admin** selon les rôles onchain.

## Ce qui fait autorité

- `contracts/src/Physics.sol` : physique événementielle entière, miroir `shared/physics.ts` en bigint ; premier à 7, terrain 1024 × 576.
- `contracts/src/Game.sol` : consentement des deux joueurs, commit/reveal, sessions EIP-712, horloge en blocs, annulation, saisons et ELO.
- `contracts/src/Vault.sol` et `Market.sol` : retraits signés par le compte principal, modules définitivement scellés, LMSR PRBMath, réserves vérifiées après chaque achat, règlement et remboursement.
- `contracts/src/Tournaments.sol` : 2 à 32 joueurs, placement par ELO, élimination directe, inscriptions et prix en MON de test.
- `relayer/src/main.ts` : simulation, quotas, budget, journal PostgreSQL, transactions signées persistées, matchmaking et diffusion WebSocket. Le relayer ne choisit pas les scores.
- `web/lib/wallet.ts` : véritable SDK Mera ; les clés de jeu restent en mémoire et n'ont aucun droit sur les fonds.
- `indexer/src/handlers.ts` : handlers Envio réels pour classements, replays et signaux de concentration.

## Preuves et limites

[Bilan vérifiable](docs/STATUS.md) · [architecture](docs/ARCHITECTURE.md) · [dossier des quêtes](docs/QUESTS.md).

Les résultats Anvil sont des preuves locales, jamais des mesures de performance Monad. Le script `npm run benchmark` exige un compte de test financé ; il mesure les latences p50/p95/p99 et les frais, avec une définition explicite de la mesure. `npm run match-cost` agrège les vrais reçus du relayer pour un match.

La latence d'inclusion reste perceptible. Le rendu prédit n'est pas un résultat confirmé ; le verrouillage des paris réduit l'avantage de latence sans l'éliminer. Le code V1 n'utilise pas de proxy évolutif, ni de transport interchaînes, ni de fonds réels.
