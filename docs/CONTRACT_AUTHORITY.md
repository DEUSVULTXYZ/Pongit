# Contract authority candidate

Status: preparation branch only. No production contract, environment variable, database, user session or deployment manifest is changed by this work. The current site keeps its existing coordinator and financial deployments.

The candidate moves admission decisions into contracts. It does **not** establish that the hosted Interlude operator can safely publish this larger state surface. `scripts/authority-preflight.ts --require-ready` deliberately fails while the qualification gates below remain open.

## Contracts and boundaries

| Component | Responsibility |
| --- | --- |
| `AutonomousArena` | Existing Classic/Chaos physics, scores, results, execution guard, scoped commands, immutable module addresses |
| `AuthorityActions` | Fixed delegatecall module for lobby actions, query API, checkpoint verification and recovery orchestration |
| `ContractLobby` | Global participation lock, deterministic bounded matching, eight-member rooms, proposals, invitations, rotation and expiration |
| `AuthorityRating` | Existing ELO arithmetic, placement multiplier, daily repeated-opponent reduction |
| `PlayerIndex` | Append-only unique player discovery per mode, paginated without PostgreSQL |
| `AutonomousFinance` | Monad betting windows, fixed checkpoints and final result adapter for the existing `MarketV4`/`Vault` contracts |
| `ProfileRegistry` | Unique usernames, twelve avatar identifiers, migration reservations and owner-signed updates |
| `PrivateDataStore` | Separate encrypted notebook/contact heads, chunk verification, atomic version publication |
| `UnsupportedChaosProof` | Rejects every proof. It is the only proof implementation shipped in this candidate. |

The arena and module are non-upgradeable. There is no function to replace the actions module, proof verifier or ELO source. Libraries are linked at deployment. All delegated business data uses the registered `words` mapping at slot zero. Recovery control uses a separate, unregistered namespace. Modules must be deployed from the audited build and their code hashes included in the qualification manifest. Merely accepting any address with code in the constructor is not a deployment audit.

The arena's ABI is the union of its own ABI and `AuthorityActions`: fallback calls execute the fixed module in the arena's storage. Read the module **at the arena address**, not at its standalone address. `scripts/authority-preflight.ts` generates the combined ABI privately in `artifacts/authority/arena-abi.json`.

## Matchmaking and rooms

There is no server-signed match ticket. A player's owner-authorized arcade key submits a queue, invitation or room action. Anyone may trigger bounded matching or expiration. Such a caller cannot supply a chosen pair, score or winner.

- One occupancy entry per account covers both modes. It is scoped to the execution generation.
- Queue heartbeats last thirty seconds; clients should refresh them every ten seconds. Expired entries are removed by bounded maintenance or explicit cancellation.
- Matching traverses FIFO candidates with persisted cursors, at most 32 scan steps per call. The ELO window starts at 100 and widens by 50 every fifteen seconds, capped at 600. Incompatible older players do not prevent compatible later players from being examined. The scan restarts from the oldest candidate after a complete traversal.
- Matchmaking rooms are ranked and cannot be joined by arbitrary third parties. Created rooms and invitations are friendly.
- Rooms have at most eight members. The winner is offered the next game first; the loser goes to the end. Accept/decline expiration marks nonresponding players away. Rejoin puts an away player at the end.
- Two proposal slots reserve the two game places. Both participants must accept the immutable proposal before game state is created. Repeated acceptance cannot create a second game.
- Proposals last twenty seconds; direct rematches last sixty. Targeted invitations last ten minutes. Accepting an invitation also accepts the recipient's first offered duel when one is available.
- A room without members expires after thirty minutes; other inactive rooms expire after twenty-four hours. An active participant must concede before leaving. The oldest remaining member becomes host.
- Invitations are recipient-bound, block-aware and limited by a per-pair sixty-second cooldown. Events provide the notification source; their recipients and room IDs are public.

The initial rematch candidate requires both former opponents still to be in the same two-member room. Inviting a former opponent who has left, and rematches from larger rooms, still need client orchestration with explicit departure/occupancy checks. Do not advertise the broader rematch flow as migrated.

Historical references remain `10143:<deployment>:<matchId>`. New IDs include the execution generation in the upper 128 bits. Use bigint internally and decimal strings in JSON; the existing numeric ID parsers cannot represent them safely. An old URL must never be resolved against the current deployment by ID alone.

## Authorization and sponsoring

Interlude commands use the existing SDK `withSession` grant with `command` as the sole allowed application selector. `command` additionally checks the execution generation and an internal allowlist. The existing per-player input sequence and block deadline still apply. The user's wallet derivation is unchanged.

Monad uses an additional EIP-712 authorization, not a relayed invocation of SDK `withSession`:

```
Domain: PONGIT Autonomous Arcade / 1 / chain 10143 / arena address
ArcadeGrant(player, key, generation, epoch, expires)
ArcadeCommand(grantHash, dataHash, nonce, deadline)
```

The owner signs the grant; the limited key signs commands. The grant binds the deployment through its domain, the account, execution generation, hub revocation epoch and expiry. Command nonces are sequential per grant. Expiration, revocation, account mismatch, altered calldata and replay revert before application state changes. Reverted calls roll back nonce consumption.

Only game actions are allowed. Profiles, encrypted uploads, deposits, bets, withdrawals, tournament entry and administration never gain authorization from the arcade key. Profiles and private-data upload roots use separate owner-signed `OwnerWrite` domains and nonces. The existing V4 finance contracts retain their spending signatures and fixed-beneficiary, permissionless payment triggers.

`relayer/src/authority-keeper.ts` is an unconnected candidate executor. It builds a finite set of zero-value maintenance calls, simulates them and delegates submission to an injected persistent sponsor journal. An uncertain transaction is reconciled before any new submission. Repeated work binds its observed contract state: proposal cycle, game revision, rally or payout attempt. A missing sponsor returns `waiting_for_sponsor`; there is no player-paid fallback. It is intentionally not imported by production `main.ts` and does not create a second nonce owner. Liquidity funding still requires the existing separately authorized operator flow.

## Execution and recovery

```mermaid
stateDiagram-v2
    Interlude --> Recovery: Hub permits closure
    Recovery --> Recovery: Challenge or stake window pending
    Recovery --> Monad: Hub None, recovered matches reconciled
    Monad --> Returning: Administrator, drained state, qualified proof
    Returning --> Interlude: Hosted epoch checked
    Returning --> Recovery: Protocol outage during startup
```

Candidates initialize in Monad for isolated testing. An eventual production initialization must complete the Interlude startup qualification before admission. A 429 response, client timeout or missing receipt cannot itself change the onchain execution state.

`beginRecovery` checks the actual hub session. For an active delegation, only protocol expiry or publication silence permits force closure. A challenge prevents recovery completion. `finishRecovery` waits for `releaseStake` and status `None`, preserves terminal recovered results, cancels recovered unfinished games without ELO and advances the execution generation. The financial adapter then exposes their cancellation for refunds. Admission and inputs are blocked on Monad while Interlude, Recovery or Returning is active.

Return is administrator-only, requires no active games/proposals, sealed finance and a supported proof verifier. The new delegation must be opened successfully; `confirmInterlude` checks its epoch and expiry. Node health/publication verification remains an operator qualification task, not a fact inferred from that last transaction alone. Admin and browser diagnostics can use `ExecutionChanged` and `shared/authority-client.ts::logTransition` without including grants, signatures or private data.

An engine retains a pinned view until protocol recovery. The simulated dual-chain tests are not evidence that a hosted node stopped accepting its old epoch. Test that behavior with the operator, including SDK revocation visibility, before activating automatic recovery. No browser may continue using a stale node after the base controller changes generation.

## Ranking and migration

The contract preserves the existing formula, mode separation and season genesis. Friendly games and cancellations do not rate players. `rankedPlayers(mode, offset, limit)` discovers up to 100 addresses per page; ratings are read at a common block or engine snapshot. The browser sorts by ELO descending and lowercase address ascending. Live, published and protocol-final snapshots must be labelled separately.

`importRating` reads only a source whose hub reports `None`. Actual migration must pin and validate the source state, keep the source inactive, enumerate/import every ranked player and compare both full registries. This has not been performed. The old contract does not expose its private daily opponent counters. Schedule cutover after a UTC-day boundary with no legacy play that day, or implement a verified counter import before preserving within-day limits across deployments. A new counter must not be presented as historical continuity.

Reserve existing usernames in batches before calling `ProfileRegistry.seal`. Reservations are assigned to existing owners and then claimed with owner signatures. No public registration is allowed before sealing. Names are 3–20 ASCII characters, begin with a letter, and are unique ignoring case. Avatar IDs are 0–11.

## Encrypted data

Notebook and contacts use distinct namespaces. Notebook PRF/HKDF derivation and associated data remain compatible with the existing client. Contacts use `pongit.xyz/contacts/v1` and a separate HKDF info string. Obtain the matching PRF output from the same Mera passkey; never reuse the wallet private key as encryption material.

The private client prepares ciphertext-only chunks, a Merkle root and full ciphertext hash. Upload roots are owner-signed. Each save has a fresh 12-byte AES-GCM nonce. Up to sixteen 4 KiB chunks support a 64 KiB ciphertext, exceeding the current notebook API's 60,000-character base64 bound. Oversized data is rejected without truncation. The key is nonextractable and remains in memory; raw PRF bytes and temporary plaintext bytes are cleared when possible. JavaScript strings cannot be reliably zeroized, so applications must also drop all references when closing the notebook.

Anyone may relay already-authorized chunks and commit a complete upload. Readers keep using the old head until all chunks and the full hash match. `expectedRevision` enforces compare-and-swap, including concurrent device saves. A duplicate successful commit is harmless. Incomplete uploads expire after one day; they do not erase the last complete head.

Resuming an upload checks its owner, namespace, expected revision, root, full ciphertext hash, size and IV against the attempted save. A lost successful commit response is recovered by matching that exact upload to the new head. A resume ID must never be reused for newly encrypted content.

Ciphertext, wallet association, lengths, IVs and old versions are permanent public chain data. Disconnecting only removes local keys and decrypted state; it does not erase uploaded ciphertext. Contacts must be exported through the existing authenticated account API and encrypted in the browser. No plaintext contact list or notebook is sent to a contract.

Frames are not added to contracts. Existing replay retention, financial rights, legacy vaults, manifests and transaction journals remain untouched.

## Validation and release gates

Run on an isolated VPS runner using the repository's existing toolchain:

```sh
forge test --root contracts
node --import tsx --test tests/authority.test.ts
npm run typecheck
node --import tsx scripts/authority-preflight.ts
node --import tsx scripts/differential-interlude.ts
node --import tsx scripts/differential-rooms-chaos.ts
```

The differential scripts start private local Anvil processes inside that runner. They do not call the production engine. All candidate test keys and permissive hub/proof fixtures belong exclusively to tests.

See [qualification evidence](AUTHORITY_QUALIFICATION.md) for measured results and unfulfilled gates. No production deployment command is supplied. Restore/rollback currently means leaving the existing release active; there is no candidate migration to undo.
