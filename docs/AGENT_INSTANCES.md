# House bot archetypes and independent matches

Status on 21 September 2026: design for the requested correction, not deployed.
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
