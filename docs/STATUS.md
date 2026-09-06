# Bilan PONGIT — livraison testnet

Le site est en ligne sur **https://pongit.xyz**, sur un VPS Ubuntu 24.04 avec HTTPS Let’s Encrypt. Le jeu et les fonds utilisent exclusivement Monad Testnet **10143**. Mera fournit les comptes ; Envio indexe les contrats via une passerelle RPC privée utilisant le point public Ankr. Aucun abonnement Alchemy n’est utilisé.

Correctif du 6 septembre : prédiction des raquettes, ordre des snapshots, notifications de reçus, menu du compte et comptabilité du budget sponsorisé. Le délai onchain reste perceptible ; les nouvelles mesures et leurs limites sont dans [le diagnostic de latence](LATENCY.md).

## Contrats actifs

| Contrat | Adresse |
|---|---|
| Game | `0xb66d62f0eabc5f1f86faca76bebc8353c2fbe0dd` |
| Vault | `0x49ba91379d2b52e219c7969d4fe9a647bf64d52d` |
| LMSR | `0x98f39538f25e80cf2ec0a20fca3258f0db155915` |
| Market | `0x11ba82f64e872b360e6f876ec06725c44536ef17` |
| Tournaments | `0x3420ca36e834aab3d5b6415d867397a916cf25ea` |

Déploiement : 2026-09-06T02:59:48.097Z. Début d’indexation : bloc **60075959**. Les manifestes portant `superseded` sont des déploiements de mise au point remplacés ; leurs bases sont archivées.

## Vérifications

| Vérification | Résultat et preuve |
|---|---|
| Physique finale | 10 000 comparaisons Solidity/TypeScript, zéro divergence ; [rapport](evidence/differential.json). |
| Contrats | 20 tests fonctionnels/fuzz et un invariant de solvabilité avec 16 384 achats ; tous passent. |
| Mera et précision | Trois tests SDK/ABI, PRF absent refusé, création/restauration et fin des sessions vérifiées. |
| Parcours HTTPS | Deux joueurs Mera, un spectateur, commandes confirmées, annulation signée, signature après crédit, pari, récupération, session restaurée, concession, règlement, retrait, replay, affichage mobile et commande tactile confirmée onchain ; [rapport](evidence/mera-browser.json). |
| Tournoi Monad | Quatre joueurs, trois matchs, deux tours, rattachement automatique et paiement exact de 0,01 MON au vainqueur ; [rapport](evidence/tournament-testnet.json). |
| Replay Monad | 10 snapshots Envio identiques aux logs, neuf transitions reconstruites et état final égal au contrat ; [rapport](evidence/replay-testnet.json). |
| Reprise du relayer | Arrêt avant inclusion, reprise des mêmes octets/nonce/hash, crédit unique. Test effectué sur Anvil isolé avec le code du journal livré ; [rapport](evidence/recovery.json). |
| Administration Mera | Passkey Mera autorisée, pause/reprise du jeu et du marché, tournoi créé puis annulé et droits de test révoqués ; [rapport](evidence/admin-browser.json). |
| Sauvegardes VPS | Dumps restaurés dans des bases temporaires puis dans les bases du site ; tous les comptages identiques, reprise Envio, copie hors VPS vérifiée ; [journal](evidence/backup-vps.txt). |
| Redémarrage VPS | Redémarrage réel, nouvel identifiant de boot, sept services repris, HTTPS et huit matchs Envio retrouvés ; [rapport](evidence/reboot.json). |
| Build | TypeScript et images Next.js standalone/relayer/Envio construits. Services applicatifs sans root, données persistantes, interfaces internes non publiées. |

## Mesures réelles

La sonde Monad a soumis 30 transactions à 3 transactions/s : 30 succès et 30 événements, débit observé 3,04/s, p50 **554,8 ms**, p95 **795,2 ms**, p99 **797,9 ms**. Le polling de 150 ms est inclus ; ce test ne mesure pas la capacité maximale du réseau ni la latence complète d’un mouvement. [Données et hashes](evidence/benchmark-10143.json).

Le match de démonstration #4 a coûté **0,1662021 MON de test** pour 11 reçus du contrat Game, comprenant création, reveals, commandes, résolution et concession. Les frais de marché sont séparés. Le prix dépend du nombre de transitions ; aucune extrapolation n’est présentée comme un prix garanti. [Reçus](evidence/match-cost-testnet.json).

Sur 101 transactions relayées réussies pendant les essais de déploiement, la durée entre insertion au journal et observation du reçu donne p50 **1,70 s**, p95 **5,07 s**, p99 **11,23 s**. Cette série inclut les périodes de réglage et de financement ; elle exclut la cérémonie passkey et la simulation HTTP préalable. [Rapport](evidence/relayer-latency.json). Le délai des commandes reste perceptible et les paris peuvent être refusés si leur fenêtre se ferme avant inclusion.

## Exploitation et limites précises

- Police **Michroma** auto-hébergée avec licence OFL ; logo et favicon SVG PONGIT. Interface anglaise, clavier et tactile.
- Horloge 300 ms/bloc ; balle 128/64 unités/s, raquettes 180 unités/s ; commandes expirables après 16 blocs, sans modification du passé. Le navigateur corrige le décalage de son horloge par rapport au serveur.
- Limites du RPC gratuit et du compte sponsor : quatre arènes maximum admises, budget conservateur de 6 MON de test/jour et réserve minimale. Le benchmark ne valide pas quatre parties simultanées. Aucun MON réel ni financement automatique payant.
- Les tests passkey utilisent le véritable SDK Mera et un authentificateur Chromium CTAP2/PRF virtuel. Une cérémonie sur l’appareil physique de l’utilisateur reste à confirmer.
- L’opérateur provisoire et la trésorerie de test sont des comptes distincts du déploiement et du relayer. L’attribution des rôles à la passkey personnelle attend son adresse complète. Un remplacement de la trésorerie immuable par un multisig impose un redéploiement.
- Les clés privées et secrets de services restent hors dépôt, dans des fichiers locaux protégés et dans `/opt/pongit/shared/runtime.env` (mode 600). PostgreSQL dispose de deux bases et rôles séparés.
- La copie hors VPS dépend de cet ordinateur : il doit être allumé, connecté, avec la session ouverte. Les sauvegardes VPS quotidiennes fonctionnent indépendamment et gardent sept jours. Une restauration ancienne exige la réconciliation du journal avec les transactions déjà incluses avant reprise.
- LMSR achat/règlement sans revente ; transport interchaînes hors V1. Le relayer peut retarder ou censurer une commande. Aucun audit externe ni garantie d’absence totale de bugs n’est revendiqué.

Procédures : [déploiement, sauvegarde, restauration, rollback et rôles](DEPLOYMENT.md). Candidatures réellement pertinentes : **Mera** et **Envio**, sous réserve du règlement complet du portail. Alchemy est reporté ; l’éligibilité communautaire dépend de l’équipe.

Les autres preuves `local Anvil` dans ce dossier documentent les essais locaux antérieurs ; elles ne remplacent pas les mesures Monad de la version publique.
