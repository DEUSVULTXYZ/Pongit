# Independent human arenas with current Chaos rules

This is a **source candidate**, not a deployed or qualified release. Production
remains closed on its existing deployment. Agent arenas are unchanged.

`IndependentEventsArena` (rules 12) binds the existing contract-owned
`IndependentLobby` to the corrected `PongChaosEvents` engine and its immutable
modules. It keeps the full human `IndependentTypes.Binding` and published-result
interfaces. `IndependentEventsLobby` extends that lobby with atomic payment
cutoffs; the common lobby still owns matchmaking, participation, room
rotation and ELO; the individual physics arena does not calculate another ELO.

The two human controls use the same bounded family authorization as the
independent lobby, then arena-local renewal/revocation with the reviewed
`PoolAuthorizations` layout. This matters because the older human helper used
words 21–26, which now hold packed Chaos physics. The candidate uses disjoint
authorization words 54–59 and the `PONGIT Pooled Arena` signature domain. Its
client must explicitly support that domain and rules version, not reuse the old
decoder merely because both contracts expose `boundMatch`.

The arena has no bot controller, agent duration limit or financial balance. It
inherits the human first-to-seven rules, current realtime pressure validation,
drand verification and all 24 effects. An unopened admission reports epoch zero;
its expected epoch is separately checked against the actual hub opening. A
cancelled preparation does not consume an epoch. The last opened epoch survives
a hub that clears its released session tuple.

Initial Solidity integration tests exercise the actual common lobby and grants
with a lifecycle fixture: simultaneous Classic/Chaos, closure isolation, a third
admission during the first arena's challenge window, cancellation before opening,
renewal after a cleared hub tuple, old-match rejection, control permissions and
preservation of packed Chaos state during key renewal.

`IndependentEventsSettlement` and the existing `RealtimeMarket` retain betting
during rallies. No 40-block window is introduced. The lobby captures the first
published result and its finish timestamp atomically before releasing the match
lock. A missing timestamp rolls back the entire capture. Later ranking
corrections do not replace that payment decision. The existing arena reuse gate
requires a final captured result, so a new match cannot overwrite an uncaptured
cutoff. Unclaimed winnings and late-bet refunds only read the captured ledger,
including after the arena has been reused. Cancellation refunds all paid stakes.

Solidity integration tests use the real new arena/lobby, market and vault with
a hub fixture. They cover uninterrupted betting, delayed claim after arena
reuse, the cutoff failure rollback, challenge refusal and correction without a
second payment. This is not a hosted financial or publication proof. The older
`IndependentSettlement` remains unchanged for its historical deployment.

Before this candidate can be deployed or opened, complete and audit:

- The rules-12 manifest, ABI, snapshot decoder, compact player authorization and
  service start/proof/pressure adapters, including three-second UI countdown.
- Service/deployment wiring for the new realtime settlement, market and vault,
  then actual hosted stakes, pressure and payouts. Do not deploy the old
  `IndependentSettlement` alongside this candidate.
- Verified human ELO/profile migration and the existing financial history.
- Hosted admission, publication, closure, release gas, renewal, real two-player
  and spectator flows, and enough actually admitted reserve capacity.

No old contract, ledger or withdrawal address is changed by this source addition.

Validation on 20 September 2026: 37 Solidity tests passed across the new arena,
the existing independent lobby and the realtime market. This includes twelve
new candidate cases. The first seven-case run contained a fixture assertion
that confused room membership with the active-match lock; it is preserved as a
failed report. The corrected case verifies that the match lock clears, friends
remain in their room, and each can leave normally after renewing an expired
family grant.

The compiled runtimes are 25,329 bytes for the arena, 24,750 for the common lobby,
and 5,438 for the settlement. The arena and common lobby have an explicit 32 KiB
candidate budget in the deployment tool. The common lobby executes on Monad;
the arena still requires hosted qualification. Other contracts keep their
existing 24 KiB tool limit. These measurements do not establish release-gas or
provider-capacity limits.
