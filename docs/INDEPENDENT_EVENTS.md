# Independent human arenas with current Chaos rules

This is a **privately deployed candidate**, not a qualified public release.
Production remains closed on its existing deployment. Agent arenas are unchanged.

## Hosted checkpoint, 20 September 2026

Contract source `3a4c3ec` was deployed with service `5e3cae2` into a separate
temporary database and private network. Its three arenas are
`0x983ea4b68129b349afe141727b3a1644fafe3f93`,
`0x88e89abda6d46244f44f596fdb69a7ddc97e926e` and
`0x5301c251dc29b9b73cb15db56e1cd4cf1cd40c9a`.
The common lobby is `0x82f122b569f4ce2b8be5326f47a05794e1295362`.
This fixture deliberately sealed an empty migration; it is not the production
ELO/profile migration.

The first controlled hosted Chaos game ended naturally at 4-7. Both synthetic
players exceeded 100 confirmed direction changes (150 and 129). The 279 input
receipts measured approximately 112 ms p50 and 132 ms p95. Four revealed effects
were observed, including multiball. Actual 0.006-test-MON positions on each side
were transported as confirmed pressure; publication and capture were followed
by an automatic 0.006-test-MON payout to the disconnected beneficiary. The
reported service countdown was backed by the contract deadline. This is not
all-effect, browser, physical passkey or sustained-load qualification.

That combined run **failed** its Classic engine-identity deadline. The endpoint
initially lacked a reachable IPv4 address and became reachable later. The
service resumed observation without creating a duplicate session, then started
and captured a 7-6 game without test players controlling it. That game is not a
passing controlled Classic trial. Chaos completed independently during the
outage. Both original reports are retained.

The next real Chrome check created three Mera accounts and saved their unique
profiles successfully, closing each profile dialog after confirmation. It then
exposed two client defects before starting a game: a ranked-room link attempted
to join its spectator as a participant, and a queue heartbeat racing with
matchmaking surfaced an unrelated rejection. The client now uses an explicit
read-only spectator entrance and rechecks queue occupancy. An uncertain signed
heartbeat is still reconciled through its existing journal. Browser validation
of these fixes is pending; the failed run is not overwritten.

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

The first engine `start()` call arms a three-second deadline in word 60. A
second call can start physics only after that deadline; repeated calls cannot
extend or skip it. The UI reads this deadline and the engine clock, then displays
the digits using monotonic browser time. Controls remain off until phase 2 is
observed, even if the displayed countdown has reached zero.

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

The rules-12 manifest, ABI, packed snapshots, player signature domain, compact
controls, pixel Chaos renderer and replay restoration now have versioned adapters.
The service has separate start, drand and realtime-pressure workers, sharing one
writer per arena. A ready proof reserves the next command; fetching a delayed
proof does not stop ticks. Old-epoch proofs are discarded before submission.
Confirmed owner renewals are deduplicated using the actual `observed` journal
status. A lost response retains its signed bytes and nonce until reconciled.

These adapters are **not yet hosted qualification evidence**. Rules 12 is rejected
by the service unless `PONG_INDEPENDENT_EVENTS_QUALIFICATION=isolated-vps` is
explicitly set in the temporary private environment. No production manifest or
admission flag is changed by this work.

Before this candidate can be opened, complete and audit:

- Actual-build browser checks and hosted qualification of those adapters.
- Deployment of the new realtime settlement, market and vault, then actual
  hosted stakes, pressure and payouts. Do not deploy the old
  `IndependentSettlement` alongside this candidate.
- Verified human ELO/profile migration and the existing financial history.
- Hosted admission, publication, closure, release gas, renewal, real two-player
  and spectator flows, and enough actually admitted reserve capacity.

No old contract, ledger or withdrawal address is changed by this source addition.

Validation on 20 September 2026: 38 Solidity tests passed across the new arena,
the existing independent lobby and the realtime market. This includes thirteen
new candidate cases. The first seven-case run contained a fixture assertion
that confused room membership with the active-match lock; it is preserved as a
failed report. The corrected case verifies that the match lock clears, friends
remain in their room, and each can leave normally after renewing an expired
family grant.

Thirty targeted TypeScript tests pass, including response-loss reconciliation,
stale bindings, countdown scheduling, proof priority, confirmed betting sources
and the preserved legacy ABI. These use simulated services and are not a substitute
for the live multiplayer and renewal tests.

The compiled runtimes are 25,679 bytes for the arena, 24,750 for the common lobby,
and 5,438 for the settlement. The arena and common lobby have an explicit 32 KiB
candidate budget in the deployment tool. The common lobby executes on Monad;
the arena still requires hosted qualification. Other contracts keep their
existing 24 KiB tool limit. These measurements do not establish release-gas or
provider-capacity limits.

The full source regression passed 556 Solidity tests (six environment-dependent
hub checks skipped) and 480 TypeScript tests. The production Next build passed.
Chrome and Edge each passed ten actual-build UI cases covering both modes at
360, 390, 768, 1440 and 844 px: all three countdown digits, disabled early
controls, movement and release, fixed Chaos indicators, 16:9 court, and the
result dialog's background lock. These cases mock the chain and API; they are
layout/client checks, not hosted multiplayer or passkey qualification.

The private service now keeps business data in its own database while using
the existing operator database for `il_lifecycle_jobs` and advisory lock 701340.
It must not start an independent nonce allocator with the same operator key.
Six real PostgreSQL checks passed, including forty concurrent submissions,
cross-database recovery after journal creation, and refusal to resend another
queue's pending transaction. No transactions were sent by that database fixture.
The dispatcher also checks the chain gas limit before signing.

A read-only preflight at block 64085546 found no pending operator transaction,
the expected testnet pressure signer, and a successful admission simulation.
This is not an arena reservation or evidence of three real hosted admissions.
