> Priorité : jeu fonctionnel. Les quêtes sont facultatives ; retenir seulement les intégrations démontrées. Alchemy reste reporté en configuration gratuite.

# Dossier de candidature — PONGIT

PONGIT est un jeu web où une passkey suffit pour jouer sans extension ni gas à payer. Les collisions, résultats, ELO, dettes des marchés et prix des tournois sont vérifiables dans les contrats.

Track principal conservé : **Consumer Products & Payments**, celui sélectionné dans la capture. L'angle est l'accès grand public et les paiements intégrés aux compétitions. L'adéquation précise dépend du règlement du portail ; cette sélection ne constitue pas une validation organisateur.

| Quête visée | Dotation de la capture | Intégration livrée | Preuves et compléments |
|---|---:|---|---|
| Best Use of Envio | 1 000 USD | `indexer/src/handlers.ts`, GraphQL, classements, replays ABI, alertes de concentration. | Indexation Linux réelle, replay comparé aux logs RPC, reprise de checkpoint. Utiliser les adresses du manifeste et les reçus de démonstration du bilan. |
| Best Projects using Alchemy | 1 000 USD en crédits | `ALCHEMY_RPC_URL` prioritaire dans le relayer, déploiement et benchmark ; simulation, envoi, lectures et reçus via viem. | Clé non fournie : **aucun trafic Alchemy attesté pour l'instant**. Ajouter hashes soumis via Alchemy et capture du dashboard. |
| Best Mera-Powered UX on Monad | 2 500 USD | `web/lib/wallet.ts`, SDK Mera 0.2.0 et adaptateur viem : création/restauration PRF, session de jeu et opérations de fonds. | SDK réel utilisé sur le domaine HTTPS. Les tests automatiques emploient un authentificateur Chromium PRF virtuel. Ajouter cérémonie passkey physique sur le domaine HTTPS, récupération et transactions Monad sans extension. |
| Best Community Team Project | 5 000 USD | Condition d'équipe, sans solution par le code. | Vérifier l'appartenance à une communauté partenaire éligible et fournir l'affiliation. |

Les montants viennent des captures. Le règlement complet, les échéances et critères de cumul restent à vérifier dans le portail connecté. Ne pas annoncer ces prix comme acquis.

L'usage de Mera pour le wallet et les clés de jeu ne justifie pas à lui seul **Mera: One Passkey, Many Keys**, dont l'angle annoncé est un usage créatif hors wallet. Les autres quêtes ne sont pas revendiquées par cette V1.

## Démonstration

1. Créer puis récupérer une passkey sur le domaine final ; montrer l'absence d'extension.
2. Deux appareils signent leurs délégations et jouent. Montrer sur l'explorer un input, le snapshot et le résultat calculé par le contrat.
3. Un spectateur achète des parts en MON de test ; montrer le verrou avant impact, la mise confirmée puis le règlement et le retrait.
4. Ouvrir le classement et le replay Envio ; comparer un snapshot indexé au log du contrat.
5. Montrer un tournoi terminé, le paiement au vainqueur, les pauses.

À joindre : dépôt et commit, domaine, manifest `testnet.json`, versions SDK, tableau Envio, rapport benchmark Monad, coût d'un vrai match, vidéos et liens explorer. Les preuves Anvil dans `docs/evidence` restent des preuves locales.

## Sources techniques

- [Envio : réseaux HyperIndex](https://docs.envio.dev/docs/HyperIndex/supported-networks).
- [Alchemy : API Monad](https://www.alchemy.com/docs/reference/monad-api-quickstart).
- [Mera : passkeys et sessions](https://github.com/category-labs/mera).
- [Monad : frais facturés sur la limite de gas](https://docs.monad.xyz/developer-essentials/gas-pricing).

Ces sources documentent les intégrations ; elles ne remplacent pas le règlement du concours.
