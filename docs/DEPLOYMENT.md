# Exploitation PONGIT

Site canonique : https://pongit.xyz. VPS Ubuntu 24.04, 5.135.107.1, SSH 3333, utilisateur `pongit`. La configuration SSH locale associe les alias `pongit`, `pongit.xyz` et l’IP à la clé dédiée, avec vérification stricte de la clé d’hôte.

## Installation reproductible

`ops/provision.sh` installe Docker et Compose, active leur démarrage et ouvre 80/443 en conservant 3333. Copier une version validée sous `/opt/pongit/releases/<commit>`, placer la configuration privée dans `/opt/pongit/shared/runtime.env` (mode 600), puis lier `.env` dans la release à ce fichier. Renseigner les valeurs de `.env.example`. Les comptes et clés de déploiement/administration restent dans un fichier opérateur séparé, jamais dans le conteneur web ou relayer.

Déployer les contrats avec `npm run deploy`, conserver les reçus et le manifeste `deployments/testnet.json`, puis exécuter `INDEXER_RPC_URL=http://rpc:8545 npm run indexer:configure`. Le générateur utilise la passerelle privée pour la synchronisation Envio, des lots de 99 blocs et un polling de 1,5 seconde. L’image Envio installe les certificats racines nécessaires à son client RPC natif.

Le frontend se construit pour le domaine final (URLs API/WS et RP ID). Exécuter `docker compose build`, puis `docker compose up -d`. Le nom Compose fixe `pongit` conserve les volumes entre releases. Caddy obtient et renouvelle les certificats Let’s Encrypt ; ses données ACME sont persistantes. Les ports publics sont 80/443, plus SSH 3333. PostgreSQL, Hasura et le relayer restent sur le réseau privé Docker.

PostgreSQL héberge deux bases et rôles distincts : `pong_relayer` et `pong_indexer`. Seul le second est accessible à Hasura. Ne jamais remplacer la base du journal par une autre chaîne ou un autre signer : le contrôle de fingerprint refuse ce mélange. Les déploiements de mise au point sont conservés dans les manifestes `*-superseded.json` et leurs bases restent archivées. Le manifeste `testnet.json` désigne toujours la version publique actuelle.

## Comptes et financement

Monad Testnet 10143 uniquement. Le gas sponsorisé, les crédits de démonstration et la liquidité utilisent des MON de test obtenus gratuitement. Le relayer a un budget quotidien et une réserve minimale configurables. La configuration initiale limite les dépenses à 6 MON/jour et le prix du gas à 200 gwei. Elle réserve le gas maximal et la valeur pour les transactions signées/en attente, puis compte les frais du reçu et la valeur effectivement transférée à leur confirmation. Les réservations encore ouvertes sont conservées après minuit UTC. Le rapport de coût utilise les frais réellement facturés.

Pour un compte de moins de 10 MON, Monad impose un intervalle entre transactions dépensant de la valeur. Le relayer attend la sortie des transactions précédentes de cette fenêtre avant de créditer un joueur ou de déposer une liquidité. Une transaction déjà signée est toujours reprise avec les mêmes octets et le même nonce.

Pour attribuer les rôles fonctionnels à une passkey, utiliser depuis un environnement opérateur privé :

```sh
npx tsx scripts/admin.ts grant 0xADRESSE_MERA
# ou revoke pour retirer ces mêmes rôles
```

Cette commande exige `ADMIN_PRIVATE_KEY`, `RPC_URL` et le manifeste correspondant. Elle n’accorde pas le rôle d’administration racine ni le droit sur la trésorerie. Les opérations de la console admin sont payées par le compte administrateur ; le financer en MON de test. Les adresses de trésorerie immuables nécessitent un redéploiement pour être remplacées ; les rôles transférables sont modifiables onchain.

## Sauvegarde, restauration et redémarrage

Installer `ops/pongit-backup.service` et `.timer` dans `/etc/systemd/system`, activer le timer. Il appelle `ops/backup.sh` chaque jour vers 03:30 UTC avec sept jours de rétention. Les dumps, configuration privée, manifeste et référence de version sont sauvegardés sous `/opt/pongit/shared/backups` (droits privés). Copier les sauvegardes hors VPS par SSH vers un emplacement protégé ; la tâche Windows « PONGIT offsite backup » copie le dernier dump chaque jour à 05:40 (heure locale) et à la connexion de l’utilisateur. La destination `.ssh/pongit-secrets/backups` est protégée par ACL. La copie exige que cet ordinateur soit allumé, connecté et la session ouverte ; le timer VPS fonctionne indépendamment.

Avant une restauration, vérifier que le manifeste et le compte signataire correspondent. Exécuter explicitement `bash ops/restore.sh /opt/pongit/shared/backups/TIMESTAMP`. La commande arrête les écrivains, vérifie les checksums et restaure les deux bases avant leur reprise. Tester d’abord le dump dans une base temporaire. Une sauvegarde ancienne ne modifie pas la chaîne : vérifier/reconcilier les reçus déjà inclus avant toute reprise du relayer.

Contrôles : `docker compose ps`, `docker compose logs --tail=50`, `curl -f https://pongit.xyz/api/health`, puis ouvrir le classement et un replay. Docker redémarre les services après reboot ; conserver `ssh.socket` et le port 3333.

## Retour à une version précédente

Conserver la release précédente et ses images. Arrêter le relayer avant le changement ; repointer `/opt/pongit/current` vers la release validée, conserver le même fichier privé et le même manifeste, reconstruire si nécessaire puis relancer Compose. Les volumes restent en place. Ne pas revenir à des contrats remplacés avec le journal de leurs remplaçants. Les migrations additives permettent le retour applicatif ; une migration incompatible exige sa sauvegarde et une procédure dédiée.

## Services et quêtes

RPC public et Envio auto-hébergé : aucun abonnement supplémentaire. `ALCHEMY_RPC_URL` permet une activation ultérieure, mais aucune candidature Alchemy n’est présentée comme intégrée actuellement. Les quêtes ne conditionnent pas la livraison du jeu.
