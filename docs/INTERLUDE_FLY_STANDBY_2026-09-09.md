# Fly.io rehearsal paused at the owner's request

Status at 10:31 UTC, 9 September 2026: **standby; no production cutover**.

The hosted control service now provisions `fly.dev` endpoints. The previous deployment records return `404: no node for this app`, even though some Railway endpoints still answer. Do not substitute the demo RPC or assume an old endpoint has moved.

## What passed

- A fresh `PublicationProbe` at `0xe4f978d978cbafe6682d0ac056d773fe2c950c94`, served by `https://il-e4f978d978cbafe6.fly.dev`, accepted an increment and published value **1** on Monad. The publication failure reported on 8 September is not reproduced by this probe.
- The updated game at `0xfd1693294fed77304662f08e827b043b0ba386a3`, served by `https://il-fd1693294fed7730.fly.dev`, created independent Classic and Chaos matches. Both were subsequently conceded using their restored test sessions, and both terminal results were verified on Monad at batch 2.
- A separate Chaos match accepted a real owner-signed bet costing `5453767801646969` wei. Its favourite's paddle half-height became `36000000`, equivalent to a 72-unit paddle. The coordinator later observed the completed result. Receiving the wallet payout after delegation closure has **not** been validated on this candidate.

## Remaining rate limit

The 100-input test stopped on an HTTP 429 read after 14 accepted inputs. A subsequent financial test also stopped on a `getSnapshot` read with the same response. Signed transactions were not blindly replayed.

A bounded read-only probe recorded 49 successful `interlude_session` responses followed by HTTP 429 on its 50th request, while the private coordinator was also running. The rejection included `Retry-After: 10` and Fly request ID `01M22V5EQ7V6R925KRQJHM3WHR-ams` at 10:24:38 UTC. This observes a limit under that workload; it does not establish the provider's exact quota, refill rate or IP-sharing policy.

Read coalescing, mandatory fresh reads after writes, removal of duplicate player polling, fewer idle Chaos ticks and respect for read cooldowns are prepared in source. TypeScript checking and 12 targeted tests passed. The full browser/load check and rebuild of these latest frontend changes are deferred while the owner has paused the rollout.

## New financial bindings

These belong only to the new Fly candidate. The earlier candidate's bindings remain in the manifest and must not be overwritten.

| Instance | Address |
| --- | --- |
| Game | `0xfd1693294fed77304662f08e827b043b0ba386a3` |
| Hub | `0x3Ef8327F69e09cf721772F345e2A887eA22cD595` |
| Window/result adapter | `0xef58b351362dd816fcc3c512f00b92b89bb2bb2b` |
| Vault | `0xfa37752cff3bb9806bae84d5e028b20e951817e9` |
| MarketV4 | `0x52f3058e02fc3d2dc585ee7d29aa877b8e28afb9` |

The new vault's module bindings are sealed. The shared testnet pressure signer is unchanged. Production manifests, images, contracts and databases were not switched to these instances.

## Preserved state and resumption

The private coordinator, RPC gateway and test database containers are stopped. A protected backup contains the database, diagnostic grants, service identities, manifests and reports; an off-VPS copy is checksum verified. At pause, all 17 private financial jobs were recorded as succeeded and all 186 engine jobs as observed. This is transaction-journal status, not proof that beneficiary payouts are complete.

On resumption, inspect the existing onchain delegation and financial obligations before starting workers. Preserve the database and every signed transaction. Reconcile any elapsed delegation, complete the wallet payout and close/renew checks, revalidate the ELO pin and rerun multiplayer under the confirmed RPC quota. Do not recreate the same games or erase their markets. `deployments/interlude-rooms-fly-preview.json` deliberately remains `releaseReady: false`.
