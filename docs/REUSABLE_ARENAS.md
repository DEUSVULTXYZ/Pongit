# Reusable arenas and testnet admission transport

## Agent candidate and actual human renewal, 20 September 14:12 UTC

The private human arena was actually released on Monad, consuming 1,057,504
gas, and its epoch-1 root was sealed without changing either result. Epoch 2
opened on the same application and admitted four newly registered fixture
accounts. Classic and Chaos published new results, and both epoch-1 historical
proofs remained final after actual epoch-2 gameplay. The combined run passed at
14:10:45 UTC and closed epoch 2 after 70 batches. These four matches ended by
concession, not a natural seventh point. This does not establish uninterrupted capacity,
natural full matches or production financial migration.

The rules-15 agent candidate adapts the same fixed-slot admission and result
tree to contract strategies, eight house policies, five-minute regulation and
bounded knockout overtime. Human challenges retain explicit readiness and a
scoped player key. Strategies cannot receive an external control key or a
financial permission. There are no markets in this deployment.

The Monad authority keeps tournament and challenge participation, exact issued
tickets, qualifications and ratings. Publication proofs release a match's lane
without closing the entire engine. A registered community strategy absent from
the engine's pinned base state waits for a newer arena; compatible queued work
can continue. Tournament learning is reconstructed from the current resolved
branch. Invalidated descendants and unsynchronized corrections cannot seed a
replacement bot.

The isolated regression run passed **86 Solidity tests**, including the new
arena, authority, learning correction and historical pool/series/tournament
tests. The full TypeScript suite passed **526 tests** and type checking passed
with the new hosted agent driver. Cross-language admission hash vectors agree. The actual SDK
generator and checker passed all seven layouts using the pinned vendored
protocol sources; earlier check attempts used duplicate bundled sources and
are retained as harness failures.

Measured runtimes are 23,756 bytes for the arena, 19,693 for the game library,
31,159 for the Monad-only pool and 1,926 for the learning library. The root
keeps a 24 KiB guard; only the explicit Monad authority has a 32 KiB budget.
Eight short offline games touched 46 distinct keys, not a worst-case publication
measurement. Agent contracts have not yet been deployed or hosted-qualified.
Public gates remain closed and no final unchanged 24-hour trial has started.

Status: integrated rules-14 contract candidate, **initial hosted reuse passed, not enabled**. Public human,
agent and tournament admission gates remain closed. No final 24-hour trial has
started. The existing private tests continue on their immutable deployments.

On 20 September the owner explicitly approved extending the testnet bridge to
admission. Provider capacity/configuration changes are not part of this approach.
Monad continues to choose and reserve players. A bridge transports an issued
ticket into a running Interlude session. It does not gain a spending permission.
This is a trust assumption for live admission, not a cryptographic state proof.

## Bounded storage and preserved results

`ReusableArenaStorage` backs the candidate `ReusableEventsArena`. It uses one
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

## Integrated human candidate, 12:30 UTC

The human authority now reuses the existing deterministic Monad lobby, both
consents and participation locks. It records each complete ticket before the
bridge signs it. The immutable physics adapter uses the existing Classic and
24-effect Chaos engine on one physical slot, with logical IDs in snapshots,
randomness verification, pressure checkpoints and results. Both players must
acknowledge readiness before the three-second launch countdown.

`ReusableEventsLobby.captureProof` releases participation from a result proved
against the actual published commitment and exact issued ticket. Ordered ratings
retain corrections; the first payment result and cutoff remain frozen.
`ReusableEventsSettlement` requires the exact published admission for live bets.
A newer match in the slot cannot change an older match's beneficiary or market.

After release, an unfinished slot is marked cancelled without appending to the
final root: another reader may already have sealed that root. The Monad authority
uses absence from the final published prefix to record a technical cancellation
and refund. A missing RPC response or expired ticket alone cannot release a
participation lock. Renewal requires the previous root to be sealed first.

The integrated offline suite passed **40 tests**: 8 arena, 4 lobby, 8 settlement
(including inherited lobby tests) and 20 historical independent-arena regressions.
Sixty-four short matches alternating actual Classic/Chaos physics touched 42
distinct keys across the run, at most 36 distinct keys in any one short match.
These matches end by concession and do not cover the worst event/storage case.
This is not hosted publication, a maximum-duration qualification or proof of
capacity. The earlier storage-only numbers above describe a different harness.

The root and linked game fit the 24 KiB deployment guard. The Monad-only lobby
uses the existing explicitly allowlisted 32 KiB budget, checked in tests and the
deployer. Generator output identifies the single annotated mapping at slot zero;
the compiler layout check passed for all six generated surfaces, including the
new arena (commitment `8d1ff0a14e02dad8fd74e6d621b05b7cc93c6ca5c3e78ad386e68af083201626`).

The broader isolated run passed 100 tests, including the unchanged Chaos gas and
announcement regressions and the published-root golden vector. The subsequent
typed-admission cross-language vector passed with its four existing cases. The
complete TypeScript suite then passed 520 tests. These counts still describe
local execution on the isolated VPS, not hosted acceptance or a release verdict.

Final measured runtimes are 22,622 bytes (arena), 23,132 (linked game), 29,438
(Monad lobby), 5,668 (settlement) and 4,586 (result verifier). Explicit epoch
commands add a fixed argument, not a repeated wallet authorization.

The TypeScript proof index verifies ordered log prefixes, produces historical
proofs only against the exact published root/count, and rewinds only to a
verified canonical prefix. Full result records must still be archived and
replayed after a reorganization. Compact browser commands and their existing
durable journal can opt into explicit epoch plus logical-match binding; old
contracts retain their original encoding.

## Remaining implementation and qualification

### Actual first reuse, 20 September 13:07 UTC

The isolated candidate at `0x60cb8c03a2f4f0900b72788680df24e994a2ea30`
opened epoch 1 and then registered four new synthetic accounts on Monad.
The bridge admitted them in two successive games in that same session.
Classic accepted 36 movement commands and ended by concession at 3-4.
Chaos accepted 28 commands and two actual drand proofs, and ended by
concession at 3-3. Both complete result records were published and captured
by the Monad authority. The first result was proved again against the second
published root after physical-slot reuse.

Closure succeeded after 55 batches. The actual hub unlock time is
20 September 14:07:36 UTC. Release, a new epoch, payment flows, worst-case
publication and uninterrupted capacity remain separate gates. These short
concession matches do not establish natural finishes or production readiness.
The first driver report remains failed on temporary operator-journal contention;
the resumed report uses the original signed-command journal and deployments.
Private state was hash-verified off the VPS before renewal qualification.

The public configuration and all admission switches are unchanged. No request
for a provider configuration change was made.

1. Finish auditing and qualifying the complete adapter, generator layout,
   canonical result archive, bridge signer and proof consumers on hosted
   Interlude. Deployments remain isolated candidates, with public flags off.
2. Adapt the separate agent authority, five-minute rules, strategy controllers
   and tournaments to reusable arenas. This candidate does not silently change
   human game duration or run bots in human slots.
3. Measure worst-case publication size/changed slots and release costs. The
   current 31-minute admission time reserve covers the existing 30-minute human
   safety cancellation plus a margin; it is not measured publication headroom.
4. Qualify real sequential games, concurrent human/agent capacity, all financial
   paths, publication, closure and renewal. A bounded storage footprint alone
   does not prove continuous availability or remove the hub's real expiry.
5. Preserve the final unchanged 24-hour, browser, tournament, verified migration
   and off-VPS backup gates before any public activation.

There is no automatic Monad gameplay fallback and no automatic public activation.
