# Livraison PONGIT V2 — 6 septembre 2026

Site : **https://pongit.xyz**. Monad Testnet, chaîne **10143**. Dépôt **DEUSVULTXYZ/Pongit conservé privé**. Le fichier `RELEASE` de `/opt/pongit/current` identifie exactement le commit en ligne.

## Fonctionnalités disponibles

- Classique et Chaos, ELO séparés, défis ciblés amicaux ou classés, liens ouverts ou réservés, consentements signés, boîte de réception et blocage.
- Profils publics facultatifs, avatars prédéfinis, adresse complète et déconnexion ; identité néon Michroma avec Orbites opposées, deux autres propositions et favicon.
- Raquette Chaos réduite uniquement après une pause entre échanges, selon les MON réellement payés. Seuil de 0,002 MON, favori au-delà de 60 %, hauteur minimale de 72 unités.
- VICTORY/DEFEAT après résultat confirmé, effets passables, son désactivé par défaut, respect des préférences de mouvement réduit.
- Carnet Mera AES-GCM distinct du wallet : rivaux, notes privées horodatées depuis les replays et préférences applicables. Sauvegarde chiffrée avec conflits de révision explicites.
- Spectateurs, replays Envio, paris LMSR, réclamations, retraits, tournois Classiques et administration onchain.
- Archive V1 avec soldes, paiements et retraits séparés. Aucun transfert automatique des fonds.

Le plafond quotidien de gas sponsorisé est **supprimé à la demande du propriétaire** (`RELAYER_DAILY_BUDGET_MON=0`). Le solde disponible, les engagements déjà signés, le prix maximal du gas et les quotas contre les abus sont toujours contrôlés.

## Contrats V2

| Contrat | Adresse Monad Testnet |
|---|---|
| GameV2 | `0x47dba35e83e6488bb558bb8cdd95ec729d26770d` |
| Vault | `0x925bd397e02391557fd7e99028bea09f24bb5002` |
| MarketV2 | `0x8ab2502ddb70751c6c94155d9c71eeacf58abd04` |
| LMSRV2 | `0x8f14047ec37e0b7214e160b1392130ef9589c2f3` |
| TournamentsV2 | `0x11d61844e32352f4f7676915035ac20c015bbfd3` |
| EloFormulaV2 | `0x24638D226524dde3e773831042FBdaD70CB87de9` |

Début d’indexation V2 : bloc **60194717**. Les reçus de déploiement, liaisons et scellement sont dans [le manifeste](../deployments/testnet-v2.json). Le Game V1 reste `0xb66d62f0eabc5f1f86faca76bebc8353c2fbe0dd`, avec ses propres contrats financiers.

## Vérifications effectuées

- **49 tests Solidity réussis**, dont les invariants de solvabilité V1/V2, signatures, nonces, expiration, révocation, tailles Chaos, pauses et finalisation ELO.
- **11 tests TypeScript réussis**, incluant chiffrement, intégrité, récupération Mera, présentation, budget de réserve et priorité/fallback RPC ; contrôle des types et compilation Next.js de production réussis.
- **10 000 comparaisons de physique par mode**, aucune divergence : [preuve différentielle](evidence/v2/differential.json).
- API sociale sur une chaîne locale isolée : signature rejouée refusée, pseudo unique, conflits du carnet, compte attendu, blocage, lien réservé, acceptation concurrente et invitation expirée.
- HTTPS avec le véritable SDK Mera et des authentificateurs Chromium PRF virtuels : [Classique](evidence/v2/https-classic.json), [Chaos amical et carnet](evidence/v2/https-chaos.json), [administration](evidence/v2/https-admin.json).
- [Tournoi de quatre joueurs](evidence/v2/https-tournament.json), trois matchs, deux tours et versement exact du prix ; [défi Chaos classé](evidence/v2/https-ranked-chaos.json), ELO Chaos modifié et ELO Classique inchangé.
- [Ancien pari V1 gagnant](evidence/v2/legacy-finance.json), réclamation positive de 0,001 MON puis retrait exact via le relayer V2.
- [Panne avant inclusion](evidence/v2/relayer-recovery.json) : redémarrage d’un journal V1 avec V2, mêmes octets et nonce, un seul crédit, puis transaction V2 au nonce suivant.
- [Redémarrage réel du VPS](evidence/v2/vps-reboot.txt), services redémarrés automatiquement. Même empreinte des **356 transactions signées**, avec **356 nonces distincts**, avant et après.

Les matchs de validation peuvent se terminer par abandon signé : ce sont des tests du parcours et du règlement, pas une compétition humaine. Les données publiques de démonstration restent visibles dans les historiques.

## Mesures de latence et de coût

Première mesure après bascule, sur **128 transactions réelles**, pendant les essais et des parties concurrentes : [reçus et détail des transitions](evidence/v2/production-transactions.json).

| Mesure des 32 commandes de jeu confirmées | p50 | p95 | p99 |
|---|---:|---:|---:|
| Réception par le relayer → confirmation enregistrée | 816 ms | 1 468 ms | 1 682 ms |
| Attente avant signature | 261 ms | 700 ms | 915 ms |
| Soumission → confirmation enregistrée | 356 ms | 773 ms | 921 ms |

Le débit observé est **0,264 transaction/s sur 484,6 s**, avec des attentes de joueur et des opérations variées. Ce n’est pas une mesure de capacité maximale de Monad. Le coût des seules transitions du jeu est **0,3259035 MON** pour le match V2:1 (22 transactions) et **0,1360633 MON** pour V2:2 (8 transactions). Les montants excluent les crédits distribués, la liquidité, les paris et les appels directs d’autres comptes. Les frais de chaque transition et les transactions ayant échoué figurent dans le rapport.

Cette mesure précède la dernière correction de l’attente des transferts de valeur : un relayer suffisamment financé ne patiente plus inutilement entre les crédits et les dépôts de liquidité. Les contrôles de réserve sont conservés. La prédiction ne supprime pas le délai d’inclusion des commandes.

[Mesure mobile émulée](evidence/v2/mobile-performance.json) : viewport 390×844, tactile, CPU ralenti ×4, réseau limité à 4 Mbit/s + 40 ms. Aucun débordement ni erreur JavaScript ; LCP observé 776 ms, CLS 0,083 et intervalles de rendu p95 de 6,2 ms pendant trois secondes de replay. Cela décrit Chromium sur cet ordinateur, pas les performances d’un téléphone physique.

## Sauvegardes et exploitation

Avant bascule : sauvegarde **20260906T135334Z**. Après validation V2 : **20260906T140701Z**. Les quatre bases ont été restaurées dans des bases temporaires puis comparées table par table, sans modifier les sources. Les **186 états de replay V1** étaient identiques dans les indexers V1 et V2 avant bascule. Des copies vérifiées par SHA-256 sont conservées hors VPS, dans le dossier local protégé de l’opérateur.

Caddy sert HTTPS avec certificat Let’s Encrypt renouvelé automatiquement. PostgreSQL, Hasura, RPC et relayer restent privés. Le timer VPS sauvegarde chaque jour et conserve sept jours. La copie hors VPS via la tâche Windows nécessite que cet ordinateur soit disponible.

[Procédures d’exploitation, restauration et retour de version](DEPLOYMENT.md). Pour un retour applicatif, `ops/rollback-v2.sh COMMIT` impose les mêmes contrats V2 et conserve le journal. Il refuse une ancienne application V1 : revenir au code V1 après signature de transactions V2 serait incompatible. La sauvegarde d’un journal ne remet jamais la chaîne dans le passé ; vérifier les reçus avant toute restauration ancienne.

## Limites et candidatures

- **Interlude est préparé, pas intégré** : interface de transport et séparation des résultats live/settled documentées. SDK, contrats compatibles et modèle de confiance de l’opérateur restent à valider.
- La récupération avec la même passkey sur un **deuxième appareil physique** reste à démontrer. Les tests Chromium ne prouvent pas la synchronisation de tous les fournisseurs de passkeys.
- Les RPC gratuits et l’inclusion onchain restent une source de latence. Le verrouillage des paris ne garantit pas la disparition de l’avantage de latence.
- Trésorerie et administrateur provisoires de test ; un changement de trésorerie immuable exige un redéploiement.
- [Candidatures pertinentes](QUESTS_V2.md) : Mera UX, Mera One Passkey/Many Keys et Envio. L’éligibilité finale dépend du règlement et de la démonstration. Alchemy et une intégration Interlude effective ne sont pas revendiqués.
