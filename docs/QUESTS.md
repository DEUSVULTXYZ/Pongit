# PONGIT V1 bounty evidence

This is the historical V1 submission outline. See [V2 bounty evidence](QUESTS_V2.md) for the current notebook integration and demonstration requirements. Gameplay is the priority; claim only integrations supported by evidence.

PONGIT offers browser play through a passkey without a wallet extension or player-paid gas. Collisions, results, ELO, market liabilities and tournament prizes can be verified in the contracts.

Primary track: **Consumer Products & Payments**, as selected in the supplied screenshot. The angle is consumer access and payments integrated into competition. Final suitability depends on the portal rules; this is not organizer approval.

| Target bounty | Screenshot award | V1 integration | Evidence and remaining work |
|---|---:|---|---|
| Best Use of Envio | $1,000 | Envio handlers, GraphQL, ladders, ABI replays and concentration alerts. | Actual Linux indexing, replay compared with RPC logs and checkpoint recovery. Use deployment manifests and demo receipts. |
| Best Projects using Alchemy | $1,000 in credits | Optional `ALCHEMY_RPC_URL` configuration for relay, deployment and benchmarking. | Deferred: no Alchemy traffic attested. Configuration support alone is not a completed integration. |
| Best Mera-Powered UX on Monad | $2,500 | `web/lib/wallet.ts`, Mera 0.2.0 and viem: PRF account creation/recovery, game sessions and financial operations. | Actual SDK on HTTPS; automated tests use a virtual Chromium PRF authenticator. Add a physical-device ceremony and recovery demonstration. |
| Best Community Team Project | $5,000 | Team eligibility requirement. | Verify eligible partner-community membership and provide affiliation. |

Awards are from the supplied screenshots. Complete rules, deadlines and prize-combination conditions must be checked in the connected portal. No award is claimed as earned.

V1 wallet/session signatures alone did not qualify as a creative non-wallet use for **Mera: One Passkey, Many Keys**. V2 adds a separate encrypted notebook; see its specific cross-device demonstration requirements. Other bounties are not claimed by this V1 report.

## Demonstration

1. Create/recover a passkey on the final HTTPS domain and show extension-free access.
2. Two devices authorize game sessions and play. Show an input, snapshot and contract-computed result in the explorer.
3. A spectator buys test MON shares; show the pre-impact lock, confirmed bet, claim and withdrawal.
4. Open the ladder and Envio replay, comparing an indexed snapshot with its contract log.
5. Show a completed tournament, winner payout and administrative pause controls.

Attach repository/commit, domain, the appropriate deployment manifest, SDK versions, Envio data, Monad benchmark, actual match costs and demonstration videos/transaction links. Local Anvil evidence is not a Monad performance measurement.

## Technical sources

- [Envio supported HyperIndex networks](https://docs.envio.dev/docs/HyperIndex/supported-networks).
- [Alchemy Monad API](https://www.alchemy.com/docs/reference/monad-api-quickstart).
- [Mera passkeys and sessions](https://github.com/category-labs/mera).
- [Monad gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing).

These sources document technology, not the competition rules.
