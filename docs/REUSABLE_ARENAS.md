# Reusable arenas and testnet admission transport

Status: candidate foundations, **not enabled or hosted-qualified**. Public human,
agent and tournament admission gates remain closed. No final 24-hour trial has
started. The existing private tests continue on their immutable deployments.

On 20 September the owner explicitly approved extending the testnet bridge to
admission. Provider capacity/configuration changes are not part of this approach.
Monad continues to choose and reserve players. A bridge transports an issued
ticket into a running Interlude session. It does not gain a spending permission.
This is a trust assumption for live admission, not a cryptographic state proof.

## Bounded storage and preserved results

`ReusableArenaStorage` is a candidate library, not a playable arena. It uses one
fixed physics slot, clears its previous state before reuse, and keeps logical
match IDs, epochs, ticket sequences and participant bindings distinct. It never
creates a storage key from a new player's address or a new logical match ID.

`PublishedResultTree` retains the ordered results in a depth-16 Merkle tree.
Only the frontier (16 words), count and root persist, with an epoch identity
outside the accumulator. One frontier word changes per append. Each leaf binds
chain 10143, arena, epoch, logical match ID, Monad admission digest and the complete
canonical result hash. Full result data and proofs remain necessary for consumers;
an opaque root is not a substitute for available history.

The capacity is 65,536 terminal results per epoch. A full tree stops admissions;
it never discards an old leaf or overwrites a live match. This is a data bound,
not a claim that a session may outlive the actual hub expiry.

## Admission and settlement boundary

`ReusableAdmission` authenticates a short-lived EIP-712 ticket for exactly one
authority, arena, epoch, admission sequence, logical match, binding, rules version
and source block reference. The domain explicitly remains Monad Testnet even
when verification runs in the engine. A ticket lasts at most 120 seconds. Scoped
player permissions and actual ready acknowledgements remain separate requirements.

`PublishedResultVerifier` does not accept an arbitrary root or a bridge signature
as a result. It requires the exact ticket recorded by the Monad authority, then
reads the registered arena's published commitment and actual hub session. Missing
publication, wrong epoch, challenge, foreign chain, altered result and an unissued
ticket are rejected. A malicious bridge admission cannot settle solely because
its result appeared in a published root.

After verified release, a permissionless read seals the final epoch root on Monad.
The future lifecycle must require that seal before resetting an arena for another
epoch. Provisional roots are read live, so a publication correction invalidates an
old proof. Consumers still need their ordered rating correction, participation
release and immutable first-payment decision; this verifier does not implement
or bypass those existing rules.

## Validation on 20 September

Sixteen Solidity tests passed in an isolated VPS container with networking off.
They cover changed ticket fields/signers/expiry, replay, clearing old state,
historical ordered proofs, admission authenticity, published-root changes,
challenge and final-root retention across renewal.

A storage-only harness completed 64 synthetic games with 128 distinct participants
and changed IDs. It touched 69 distinct storage keys in total. The measured maximum
admission call used 405,154 gas; the maximum result append used 104,898 gas. These
numbers exclude physics, contract admission integration and real Interlude
publication. The harness has an artificial terminal hook and is **not gameplay**.
The conservative library namespace bound is 82 keys (63 slot fields plus 19
epoch/accumulator words), independent of the number of games within tree capacity.
Per-publication changed-slot limits must still be tested separately.

Initial fixture failures (reserved Solidity identifier, wrong mock hub selector,
and an out-of-bounds test mutation) are preserved in the private diagnostics.
They were corrected before the passing run. No production application references
any of these new libraries yet.

## Remaining implementation and qualification

1. Connect authoritative Monad lobby/agent admission to issued tickets, keeping
   both consents, deterministic assignment and global participation locks.
2. Build the immutable reusable physics adapter with every external command,
   random draw, pressure checkpoint, snapshot and result bound to the logical
   match, actual epoch and correct limited session. Do not leak physical slot IDs
   into public references or permit stale commands after slot reuse.
3. Implement proof reconstruction, reorganization recovery, canonical result
   decoding, historical settlement and rating corrections from the published root.
4. Enforce release/root archival/new-epoch ordering and a measured admission
   reserve for completion. A bounded storage footprint alone does not prove
   publication capacity or continuous availability.
5. Qualify real sequential matches, concurrent human/agent capacity, all financial
   paths, publication, closure and renewal on the hosted service before opening.
   Preserve the existing final 24-hour, browser, tournament and backup gates.

There is no automatic Monad gameplay fallback and no automatic public activation.
