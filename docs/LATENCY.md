# Délai des commandes et corrections visuelles — 6 septembre 2026

Le correctif améliore la réponse visuelle locale et retire des attentes du navigateur. Il ne transforme pas une commande onchain en commande instantanée : elle prend toujours effet à son inclusion dans Monad Testnet. Les contrats et leurs adresses sont inchangés.

## Causes constatées

- L'ancien navigateur attendait un reçu avec un polling de 400 ms, puis une nouvelle lecture RPC du match, avant de pouvoir envoyer la direction suivante. Le journal du match utilisateur #9 ne montre ni accumulation de commandes ni échec sur les 12 dernières commandes examinées. Le VPS n'était pas saturé.
- La prédiction appliquait la direction actuelle depuis la date d'un ancien état confirmé. Un changement de touche pouvait donc recalculer plusieurs secondes de déplacement de la raquette dans une autre direction.
- La lecture du match, celle de son horloge et le numéro de bloc affiché pouvaient provenir de blocs différents. Une réponse HTTP tardive pouvait également remplacer un état WebSocket plus récent.
- Le rendu anticipait des impacts de raquette et des points avant leur résolution onchain. Une commande encore en transit pouvait invalider ce rebond et produire un retour visible de la balle.

## Modifications

- La raquette locale intègre chaque image depuis sa position visuelle actuelle ; sa correction vers l'état confirmé est progressive. Un contour indique la position calculée avec la direction confirmée lorsque les deux positions diffèrent.
- Les rebonds sur les murs restent prédits. La balle attend la confirmation à un impact de raquette ou à un point incertain. L'interface affiche `Awaiting impact confirmation`. Ce choix réduit les faux rebonds, au prix d'une pause visible si la confirmation tarde.
- Le client rejette les snapshots plus anciens. Les états, horloges et blocs envoyés par le relayer sont cohérents et les matchs terminés restent figés.
- Les reçus arrivent directement par WebSocket ; le polling HTTP sert de secours. Une commande confirmée peut être suivie de la suivante sans nouvelle lecture RPC du match. Les nonces restent séquentiels et une seule commande du joueur est en attente à la fois.
- Le relayer vérifie en parallèle les reçus déjà signés, publie les snapshots avant les opérations secondaires et réutilise les états mis en cache pour les lectures HTTP. La boucle de suivi passe de 500 à 150 ms entre lectures.
- Le journal conserve les dates de signature, soumission et confirmation. Le détail au survol du délai affiche préparation/attente, envoi et confirmation. Ces durées incluent le fonctionnement du service et le polling du reçu ; elles ne mesurent pas uniquement le consensus.
- Le bouton du compte ouvre l'adresse complète, la copie, l'explorateur et la déconnexion. Celle-ci termine les sessions locales sans effacer la passkey ou les fonds ; une transaction déjà soumise peut encore aboutir. Une recherche en cours doit être annulée avant déconnexion.
- Un second essai a atteint le compteur quotidien de 6 MON : il affichait 5,998 MON réservés cumulés, pour 3,177 MON réellement dépensés. Ce blocage était distinct du délai initial. Le compteur utilise désormais les frais du reçu et la valeur effectivement transférée pour les transactions terminées, et conserve la réservation maximale des transactions signées/en attente, y compris celles de la veille. Le plafond de 6 MON et la réserve minimale restent inchangés.

## Mesures et portée

Les échantillons sont petits et proviennent de matchs différents. Ils ne constituent pas un benchmark de capacité ni une preuve de réduction de la latence du réseau.

| Mesure | Résultat |
|---|---|
| Avant : 12 dernières commandes du match #9, création au journal → reçu observé | p50 968 ms, p95 1 455 ms. Le temps navigateur est exclu. |
| Après : 9 commandes du match #10, départ de la requête navigateur → notification du reçu | p50 1 105 ms, p95 2 077 ms, p99 2 144 ms ; minimum 714 ms, maximum 2 161 ms. |
| Après : mêmes commandes, création au journal → reçu observé | p50 1 088 ms, p95 2 064 ms. Ce petit échantillon ne démontre pas une baisse du temps du relayer. |
| Dernière version : 11 commandes du match #12, requête navigateur → notification du reçu | p50 1 067 ms, p95 1 494 ms, p99 1 566 ms. Journal → reçu : p50 1 054 ms. |
| Après : médianes des étapes du match #10 | Attente/préparation 513 ms ; envoi 175 ms ; inclusion et observation du reçu 530 ms. Les médianes ne s'additionnent pas. |
| Lecture HTTP d'un match terminé, 20 requêtes avant et 20 après | Moyenne d'environ 300 ms → 47 ms grâce au cache ; ce n'est pas le délai d'une commande. |
| RPC direct depuis le VPS, 12 lectures de hauteur par fournisseur | Médianes d'environ 50 ms sur Ankr et 43 ms sur Monad Foundation ; cette lecture seule ne mesure ni simulation ni soumission. |

Quantiles calculés par interpolation linéaire entre les observations triées. Le temps d'une touche conservée pendant l'attente d'une commande précédente peut dépasser le temps de requête mesuré : le client envoie la dernière direction souhaitée quand le nonce précédent est confirmé. La réponse visuelle locale est indépendante de cette attente.

Preuves : [journal avant](evidence/latency-before-jobs.json), [HTTP avant](evidence/latency-before-http.json), [HTTP après](evidence/latency-after-http.json), [commandes match #10](evidence/input-latency-match10.json), [commandes finales match #12](evidence/input-latency-match12.json), [RPC depuis le VPS](evidence/rpc-latency-vps.json).

## Vérification

- TypeScript : vérification de types et sept tests réussis, dont quatre régressions sur l'ordre des snapshots, les impacts incertains, les changements de direction et les reçus WebSocket.
- Contrats inchangés : 21 tests Foundry réussis, incluant l'invariant de solvabilité avec 16 384 achats.
- Reprise du relayer sur Anvil isolé : arrêt avant inclusion, reprise des mêmes octets/nonce/hash et crédit unique ; [preuve](evidence/latency-recovery.json).
- Comptabilité du budget : test d'intégration PostgreSQL avec une table temporaire, couvrant succès, réversion, réservation en attente après minuit, solde mis en cache et reçu historique incomplet. Exécution : `DATABASE_URL=<base locale de test> node --import tsx --test tests/budget.integration.ts`.
- Parcours réel sur HTTPS avec deux comptes Mera et un spectateur : jeu, commande tactile confirmée, pari, retrait, replay Envio, récupération après rechargement, copie de l'adresse, déconnexion et récupération de la même identité ; [premier passage](evidence/latency-mera-match10.json). L'authentificateur Chromium CTAP2/PRF est virtuel ; le SDK Mera et les contrats sont réels.
- Dernier parcours HTTPS complet réussi après correction du budget, match #12 ; [rapport](evidence/latency-mera-match12.json). L'adresse tient entièrement dans son champ sur un écran de 390 px, la copie et la déconnexion fonctionnent ; [capture](evidence/account-mobile.png). Le passage intermédiaire du match #11 s'était arrêté sur le plafond sponsor, puis le match s'est terminé après reprise du relayer.
- Build de production Docker et services vérifiés sur le VPS. Les tests navigateur de la correction utilisent le site HTTPS, et non l'ancienne prévisualisation Docker locale.

## Exploitation et suites possibles

Sauvegarde effectuée avant déploiement : `20260906T105436Z`. La release précédente `4fa9e4662fc48ddf05add98639ec5f8e288032d7` et ses images `pongit-web:before-latency` / `pongit-relayer:before-latency` sont conservées. Les trois colonnes du journal sont additives : revenir à cette version ne nécessite pas de restaurer la base. Suivre la procédure de [rollback](DEPLOYMENT.md#retour-à-une-version-précédente), conserver les mêmes secrets et contrats, puis vérifier `/api/health`.

Un endpoint RPC dédié peut être comparé sur les mêmes étapes avant de choisir un abonnement. Changer uniquement de RPC public ne garantit pas une amélioration. Un mode entraînement entièrement local donnerait une réponse immédiate ; un mode compétitif dont seule l'issue est onchain demanderait un autre modèle de confiance et une décision produit explicite. Aucun de ces changements de modèle n'est inclus ici.
