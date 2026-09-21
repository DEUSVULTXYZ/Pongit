# Private agent publication and capacity recovery, 21 September 2026

Human Classic and Chaos remain open on backend `e4eceb6` and web `0c44f08`.
Agent Arcade and tournaments remain private. No provider capacity change,
human arena borrowing or Monad gameplay fallback was used.

## Publication stall and recovery

The original Chaos elimination trial began at 10:40:52 UTC with a fixed
11:55:52 deadline. Match 23 completed and was captured. Match 24 reached 4:3
at its five-minute game-time limit; the controller's last command was observed
at 11:03:40. Its result remained missing from Monad while the node reported
healthy HTTP, no halt and fourteen pending storage changes.

The 11:47 diagnostic records node batch 198 versus hub batch 199, with two
results in the live commitment but only one published result. The shared
publisher was funded. Neither an empty local command journal nor healthy HTTP
proved publication. The underlying hosted publication cause remains unknown.

Publication subsequently recovered. Capture transaction
`0x05c1442da71b29ec32a101d7795cd442b123fc8d0b807f9b25c9a06f0ae539c8`
is canonical in Monad block 64441019. It records the real 4:3 result, still
contestable. No force-close transaction was sent for this incident. The next
fixture was admitted at 11:52:50, but the original trial still **failed its
deadline**. Its report is retained unchanged. A separate recovery attempt does
not turn this failure into a passing uninterrupted trial.

## PONGIT recovery correction

Commit `b49dec6` fixes a separate keeper gap: an unpublished result could wait
until delegation expiry even after the hub's publication deadline had elapsed.
The keeper now checks the exact arena, epoch, ticket and sequence against the
published commitment. It can request closure only after the actual hub interval,
measured from the later of ticket issuance and the last publication. Read errors,
already published results and idle arenas are not evidence for forced closure.

Root TypeScript and 626 TypeScript tests passed. The private keeper was replaced
after an off-VPS verified backup, using the existing database, operation prefix
and shared nonce journal. Human services and agent controllers were not restarted.
This is a material maintenance change; it is not an unchanged 24-hour trial.

## Recovering PONGIT's own obsolete capacity

The September 18 private lab's soak had finished on September 19 at 15:12:58,
with 66.69% availability. Its old keeper had continued renewing delegations
after that failed trial. After a verified off-VPS backup, admissions were closed
for that lab only and its keeper stopped. The final game finished naturally.

Before closing epoch 21 of
`0x3ff9be7d8c3fbea0dc617f9cd59ff141fb6725db`, the retirement helper verified:

- The exact runtime, operator, application and epoch.
- At least sixty seconds of closed admissions, with no active or uncertain job.
- Zero active matches on both engines, matching batch counts and no pending diff.
- All eighteen epoch results against Monad and the live state, with permanent
  result-archive entries before closure.
- Successful simulation using the original journaled operator.

Closure succeeded in block 64443186, transaction
`0x06a33cc96b340fa9b061e8076710caa25c09518f212b0f5f4321427cec4854d3`.
The hub allows release no earlier than **13:03:46 UTC**. A tombstone prevents
renewal, and the old bots/service are stopped. Release and a new provider admission
remain to be verified; an elapsed timer is not proof of usable replacement capacity.
The failed trial, source, database, keys, contracts, results and backups are retained.

Sanitized evidence is in `artifacts/qualification/20260921/agent-recovery`.
The original trial and subsequent recovery have separate reports and verdicts.
Other outstanding gates include the remaining tournament formats, community
qualification, complete effect coverage, two active lanes with renewal reserve,
publication limits, shared replays and the final unchanged 24-hour trial.
