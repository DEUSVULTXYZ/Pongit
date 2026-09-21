# House bot archetypes and independent matches

Status on 21 September 2026, 15:38 UTC: private candidate deployed with both
admission gates closed; not activated on the public site.
The current immutable pool still reserves an official bot identity throughout a
tournament. The user clarified that a bot should be a reusable archetype able to
play people and other bots concurrently.

## Required separation

- Keep one competitive identity per official archetype for tournament entries,
  ranking, creator attribution and frozen strategy versions.
- Give each friendly appearance its own state, commands and learning memory,
  keyed by network, arena, epoch, logical match and side. Selecting NOVA does not
  reserve its tournament identity.
- A friendly result must neither change tournament ELO nor clear, replace or
  overwrite the archetype's active tournament participation or match pointer.
- Verify official identities through the catalogue and controller code hash.
  A copied display name cannot opt a community agent into these permissions.
- Keep community participation exclusive unless its reuse policy is separately
  designed and accepted. Preserve historical contract behavior and references.

The house controller already operates on match-local state. The blocking pieces
are `AgentChallenges._takeNext`, the catalogue participation check and
`ReusableAgentPool`'s reservation, `playing` and release operations. Removing just
the selection check would be incorrect: capture could release a tournament lock
or corrupt its active-match pointer.

## Capacity and migration

Logical copies do not supply extra execution slots. The current approved target
is two concurrent agent matches: one tournament and one challenge/qualification.
That permits a human to face NOVA while NOVA plays a tournament opponent, but not
unlimited simultaneous human challenges. Additional matches need independently
qualified capacity; they must never consume the human arena allocation.

The deployed authorities are immutable. Prepare a versioned replacement and its
reader, admission and result handling; retain existing results, pending requests,
rankings and authorizations according to their original deployment. Do not abort
the current tournament to pretend that a service-only patch enabled copies.

Validation must cover simultaneous tournament/friendly instances of the same
house bot, results in both orders, repeated capture, missing publication,
cancellation, renewed arenas, unchanged competitive locks and ELO, community
exclusivity and actual human controls. Public deployment requires real hosted
admission and publication, not only a unit-test harness.

## Candidate authority version 2

`ReusableAgentInstancesPool` opts into `HouseInstanceChallenges` and
`HouseInstanceQualifications`. The original classes retain exclusive identities.
An immutable linked `HouseInstances` helper validates catalogue membership,
creator, qualified mode and the pinned official controller hash. A friendly
instance has zero initial learning memory and no competitive `playing` pointer.
Its persisted per-match mask prevents capture or cancellation from releasing
another match's catalogue reservation, even if qualification changes meanwhile.
Community identities retain their existing reservation checks.

The optional manifest capability is `houseInstances: "official-v1"`.
Readers and runtime check the versioned pool and both queues; old manifests do
not gain the capability by changing a display label. Qualification maintenance
reads the same opponent eligibility view used by the new contract. Catalogue
responses retain competitive participation and separately expose per-mode
friendly instance eligibility. Friendly waiting then refers to arena capacity.

Local validation on 21 September: root TypeScript passed, 647 TypeScript tests
passed and 89 relevant Solidity tests passed, including 17 candidate-pool cases.
Coverage includes both capture orders, repeated capture, unpublished results,
unadmitted cancellation, renewal, catalogue/controller spoofing, community
exclusivity and the two-lane limit. These authority tests use a terminal-state
harness; they are not hosted match or browser qualification. Physics is unchanged.

The first inline-helper build failed the existing runtime budget at 33,687 bytes.
Moving the stateless predicate into a linked helper reduced the candidate pool
to 32,603 bytes, below its unchanged 32,768-byte Monad allowance. The helper is
1,237 bytes; the unchanged agent arena is 24,516 bytes. The full deployment graph
passes runtime, creation and link-reference checks. Preserve the failed report.

`deploy-reusable-agents.ts` can prepare a closed private candidate with
`PONG_REUSABLE_HOUSE_INSTANCES=official-v1` and a fresh namespace. It opens no
delegations and creates a fresh private season. **It is not a production
migration script.** Public replacement must preserve verified ratings, official
identities, registrations, pending requests and historical routes; the current
tournament must finish before retirement. Actual concurrent hosted admission,
publication and human controls are still required.

The private authority is `0xed5998627c21188db01750ea03b2309311435f5b`
(source `1af79ad`). All 51 deployment/setup transactions succeeded. No engine
delegation was opened: the real hub currently rejects the three opening
simulations with `ValidatorAtCapacity` (`0xe90bcd65`). Rather than requesting a
provider change, the existing keeper will recover and retire the already-closing
owned arena `0x1c5ec4b86149249e0b1a24aa2605eda6cb3f267b` after its actual release
deadline, 21 September 16:09:21 UTC. The other public arenas remain operational.
Retirement creates an opportunity for private admission, not a guaranteed slot.
See [the evidence and remaining migration work](validation/agent-instances-20260921.md).
