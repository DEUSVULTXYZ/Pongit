# Full contract architecture reset

Status: candidate development. No replacement application has been deployed or activated. Production remains on its existing contracts and adapters. The owner's requested scope includes the contract-owned lobby, rooms, profiles, encrypted account data, rankings and the Interlude-first execution controller with protocol-gated Monad recovery. Recreating only the older coordinator game would not implement that request.

## Observed deployment

Read-only observations on 2026-09-11:

| Field | Observation |
| --- | --- |
| Monad Testnet chain | 10143 |
| Existing app | `0xfd1693294fed77304662f08e827b043b0ba386a3` |
| Existing node | `https://il-fd1693294fed7730.fly.dev` |
| Hub | `0x3Ef8327F69e09cf721772F345e2A887eA22cD595` |
| Default validator | `0xB28E684815b095aB5Fb324214cfEa63d76F3d691` |
| Initial node observation | 13:24:24 UTC, health HTTP 200 but halted on a commit-relay 401 authentication error |
| Latest node observation | 13:53:02 UTC, health HTTP 200, not halted |
| Publication | Batch 76 now committed on Monad at 13:40:33 UTC |
| Pending changes | 0 at the latest check, previously 15 |
| Existing delegation | Active, epoch 1, expired 2026-09-10 10:10:00 UTC |
| Outstanding legacy game | One active Classic game on both engine and Monad; it has not been cancelled or awarded a winner |
| Current default terms, read at 13:34 UTC | Challenge window 3,600 s; max batch interval 3,600 s; max duration 86,400 s; 64 diffs per commit; 16 delegations |

The current terms were read separately with `defaultValidator()` and `termsOf(validator)`. They are not inferred only from the expired delegation. These are observations of the listed hub and endpoint, not a claim that every Interlude deployment has identical settings.

The publication authentication failure was resolved during this work. It is **not a current blocker** and does not justify requesting another credential repair. A production journal entry at engine nonce 276 still has no receipt; the restarted engine reports nonce 276 too. No raw transaction was replaced, dropped or marked successful from nonce information alone. The legacy match remains active at 1:3. Closing the global delegation before handling this game would freeze its unresolved result, so no force-close was issued.

The public SDK repository still resolved to `e0c6652de02236597e1c99c404262c43c5ac96db` during this check. Official references: [security and pinned external reads](https://github.com/Veenoway/interlude-sdk/blob/e0c6652de02236597e1c99c404262c43c5ac96db/docs/04-security.md), [hosted application provisioning](https://github.com/Veenoway/interlude-sdk/blob/e0c6652de02236597e1c99c404262c43c5ac96db/docs/09-for-teams.md), [delegation implementation](https://github.com/Veenoway/interlude-sdk/blob/e0c6652de02236597e1c99c404262c43c5ac96db/cli/contracts/Delegatable.sol).

## Implemented candidate change

1. A confirmed game completion requests a drain of the shared delegation. Already active games remain controllable; new starts stop.
2. The engine seals its state only after games and proposals are resolved. Once sealed, it rejects application writes.
3. A permissionless Monad close requires the published seal and matching epoch, then calls `closeDelegation`.
4. A normal renewal waits for protocol finality, finalizes financial outcomes, preserves rooms/ELO, and opens a new epoch under administrator control.
5. Each engine command binds both execution generation and delegation epoch. Closing the game delegation is distinct from revoking the player's Mera passkey grant.
6. Recovery diagnostics distinguish normal closure from an outage. Normal closure does not automatically erase room participation or switch to Monad.

The full candidate components and their remaining integration work are described in [Contract authority](CONTRACT_AUTHORITY.md). These changes are not connected to the production sponsor or browser yet. No claim is made that a test fixture replaces a hosted lifecycle rehearsal.

## What Interlude needs to qualify

The following can be forwarded to the operator:

> We are preparing a fresh PONGIT deployment with contract-owned matchmaking, rooms, rankings and recovery. Our existing app is `0xfd1693294fed77304662f08e827b043b0ba386a3` on hub `0x3Ef8327F69e09cf721772F345e2A887eA22cD595` (Monad Testnet 10143).
>
> Publication recovered during our check: at 2026-09-11 13:53:02 UTC, batch 76 is committed, the node is no longer halted and pending diffs are zero. The earlier commit-relay 401 is resolved. The delegation is still epoch 1 and expired, with one active legacy game. We are preserving its state and transaction journal while preparing the new deployment.
>
> We will close delegation after completed gameplay. The current global partition contains two concurrent games plus lobby state, so closing one game's session immediately would also stop the other. Our candidate freezes new admissions, drains both games, publishes a seal, then closes from Monad. Please confirm a supported per-match/partition provisioning flow, or the intended normal renewal flow for this use case.
>
> The hub's current default terms show a 3,600-second challenge window, 64 diffs per commit and 16 delegations. A new global delegation cannot safely reuse a still-contestable baseline in our architecture. Please provide a demonstrated close, finalization, reopening and hosted-node epoch renewal cycle suitable for consecutive matches. We must also qualify admission/result batches against the actual storage budget.
>
> Chaos needs fresh Monad betting checkpoints during an active engine session. Each checkpoint must authenticate the canonical source block, market, deployment, generation, match, rally, closure boundary and paid totals, and reject forged, stale or replayed proofs. Please identify a supported contract-verifiable transport. A current RPC read or privileged VPS attestation does not satisfy this requirement; ordinary external reads remain pinned to the delegation's base block.

## Why a redeploy alone is insufficient

A new address might avoid one damaged runtime epoch, but it does not demonstrate that publication credentials, the supported storage budget or normal session renewal work. It also does not make newer Monad betting state available inside a pinned Interlude execution. The only proof module currently shipped in the candidate is `UnsupportedChaosProof`, which intentionally rejects every engine checkpoint. Deploying it as a working Chaos implementation would leave the new arena unusable.

Do not erase old manifests, sponsor nonces, unpublished transaction records, player data or financial claims during reset. Rating migration requires a recovered, validated source state. Old ciphertext stays accessible until owners publish their encrypted versions to the new registries.

## Release gate

Activation requires both the operator qualification above and PONGIT integration work: generation/epoch-aware browser routing, the existing persistent sponsor journal, profile/private-data migration, a measured storage budget and end-to-end Classic/Chaos acceptance. Independent per-match sessions remain unqualified. There is no replacement production contract address to give users until those checks pass.
