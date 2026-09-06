# Candidatures PONGIT V2

Track principal conservé : **Consumer Products & Payments**. Présenter le jeu accessible par passkey, le gas sponsorisé, les marchés de spectateurs solvables et les primes de tournoi. Le portail et son règlement complet restent la référence pour l’adéquation du track.

| Bounty | Fonction livrée et preuve | État |
|---|---|---|
| Best Mera-Powered UX on Monad — 2 500 USD affichés | Mera crée et récupère le compte, les signatures du propriétaire et les autorisations de jeu. `web/lib/wallet.ts`, parcours HTTPS dans le rapport de livraison. | Candidature technique pertinente ; démonstration réelle sur appareil à réaliser. |
| Mera: One Passkey, Many Keys — 2 500 USD affichés | Carnet de rivaux, surnoms, notes horodatées et préférences chiffré avec un namespace PRF distinct du wallet. `web/lib/notebook.ts`, `web/components/Notebook.tsx`, `relayer/src/social.ts`. La clé AES-GCM et le contenu déchiffré restent en mémoire. | Usage hors wallet livré. Le test avec une même passkey synchronisée sur un deuxième appareil reste indispensable. |
| Best Use of Envio — 1 000 USD affichés | Indexation des contrats V1/V2, classement, replays, pression Chaos et alertes sans sanction automatique. `indexer/src/handlers.ts`, schéma et configuration RPC explicite. | Intégration réelle auto-hébergée ; prouver une reprise et un replay issu des transactions de démonstration. |
| Best Community Team Project — 5 000 USD affichés | Équipe issue d’une communauté partenaire éligible. | Condition externe, aucun code ne prouve l’appartenance. |

Les montants sont ceux des captures fournies. Aucun prix ni aucune éligibilité définitive n’est garanti. Alchemy et Interlude ne sont pas présentés comme intégrés : le RPC public Monad est utilisé et seul le contrat d’interface de transport prépare Interlude.

## Démonstration du carnet hors wallet

1. Sur `https://pongit.xyz`, créer ou récupérer une passkey Mera, ouvrir Rivals et déverrouiller le carnet.
2. Ajouter un rival privé et une note depuis « Note this moment » dans un replay. Sauvegarder le contenu chiffré.
3. Fermer le carnet puis se déconnecter : le contenu n’apparaît plus dans l’interface ni dans localStorage/sessionStorage.
4. Sur un deuxième appareil ayant accès à la même passkey synchronisée, récupérer le compte puis déverrouiller le carnet : l’adresse du wallet et les notes doivent être identiques.
5. Montrer uniquement les champs techniques IV, ciphertext et revision côté serveur, jamais une clé ni le contenu privé.
6. Provoquer deux sauvegardes concurrentes : la seconde doit signaler le conflit sans écraser la première.

Le test Chromium utilise de vrais appels Mera/WebAuthn avec un authentificateur virtuel PRF. Il vérifie la dérivation et la récupération mais ne remplace pas l’étape 4 avec un fournisseur de passkeys réel.
