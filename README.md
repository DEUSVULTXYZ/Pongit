# PONGIT V2 — neon onchain arcade

Jeu web 1v1 dont la physique, les scores, les résultats et l'ELO sont calculés en Solidity. L'interface Next.js prédit le rendu, Mera gère les passkeys, le relayer paie le gas et Envio reconstruit les historiques. Classique et Chaos disposent de classements distincts. Défis amicaux ou classés, profils facultatifs, carnet Mera chiffré, paris LMSR, coffre MON, tournois et administration sont inclus. **Local et Monad testnet uniquement.**

Site : **https://pongit.xyz**. Contrats déployés sur Monad Testnet (10143), hébergement VPS avec Docker et certificats Let’s Encrypt automatiques. Voir le bilan pour les validations et limites. Les quêtes restent facultatives et les candidatures ne sont pas validées par les organisateurs.

## Démarrer et vérifier

Prérequis : Node.js 24+, npm, Git, Foundry (`forge` et `anvil`), Docker Compose. L'indexer Envio s'exécute sous Linux dans Docker, y compris sur Windows. Les deux fichiers package-lock fixent les dépendances JavaScript ; `npm run bootstrap` installe le commit fixé de forge-std.

```sh
npm ci
npm run bootstrap
npm run contracts:build
npm run abi
npm run abi:v2
npm run typecheck
npm test
npm run test:differential
npm run test:differential:v2
```

Pour lancer toute la pile locale : [guide local](docs/LOCAL.md). Pour le VPS Linux : [déploiement et exploitation](docs/DEPLOYMENT.md). Le site propose **Play**, **Live**, **Rivals**, **Ladder**, **Tournaments**, **Archive** et une console **Admin** selon les rôles onchain.

## Ce qui fait autorité

- `contracts/src/v2/PhysicsV2.sol` : physique événementielle entière, miroir `shared/physics-v2.ts` en bigint ; premier à 7, terrain 1024 × 576.
- `contracts/src/v2/GameV2.sol` : consentement des deux joueurs, commit/reveal, sessions EIP-712, horloge en blocs, annulation, saisons et ELO.
- `contracts/src/Vault.sol` et `v2/MarketV2.sol` : retraits signés par le compte principal, modules définitivement scellés, LMSR PRBMath, réserves vérifiées après chaque achat, règlement et remboursement.
- `contracts/src/v2/TournamentsV2.sol` : 2 à 32 joueurs, placement par ELO, élimination directe, inscriptions et prix en MON de test.
- `relayer/src/main.ts` : simulation, quotas, budget, journal PostgreSQL, transactions signées persistées, matchmaking et diffusion WebSocket. Le relayer ne choisit pas les scores.
- `web/lib/wallet.ts` : véritable SDK Mera ; les clés de jeu restent en mémoire et n'ont aucun droit sur les fonds.
- `indexer/src/handlers.ts` : handlers Envio réels pour classements, replays et signaux de concentration.

## Preuves et limites

[Livraison V2](docs/V2_DELIVERY.md) · [architecture V2](docs/V2.md) · [candidatures V2](docs/QUESTS_V2.md) · [logos](docs/BRAND_V2.md).

Les contrats V1 et leurs replays, réclamations et retraits sont conservés séparément. Le plafond quotidien du sponsor est désactivé à la demande du propriétaire ; les quotas, réservations de fonds et contrôles de solvabilité restent actifs.

Les résultats Anvil sont des preuves locales, jamais des mesures de performance Monad. Le script `npm run benchmark` exige un compte de test financé ; il mesure les latences p50/p95/p99 et les frais, avec une définition explicite de la mesure. `npm run match-cost` agrège les vrais reçus du relayer pour un match.

La latence d'inclusion reste perceptible. Le rendu prédit n'est pas un résultat confirmé ; le verrouillage des paris réduit l'avantage de latence sans l'éliminer. Le code V2 n'utilise pas de proxy évolutif, ni de transport interchaînes, ni de fonds réels.
