# Agent Arcade waiting and spectator fixes, 21 September 2026

## Diagnosis

The reported waits have different causes. Recent sponsored agent transactions
confirmed in approximately 2.05 and 2.06 seconds in the inspected operations;
that sample does not measure every user's end-to-end wait. Public agent reads
took approximately 4.9 seconds for configuration and 10.3 seconds for live
matches/tournaments at 13:35 UTC. Recent numbered block-header checks were
incorrectly queued behind historical indexer traffic in PONGIT's RPC gateway.

All eight house identities are reserved throughout championship #3. The current
immutable challenge contract cannot admit a friendly copy while that identity
is reserved. Funding or an available physics arena does not remove this lock.
The intended separation is documented in ../AGENT_INSTANCES.md; it is not yet
implemented or deployed.

The keeper also submitted qualification scans without an available house
opponent. After a tournament result was captured, its active lane was cleared;
the next fixture then waited for the historical cursor to revisit the preceding
fixture. This produced avoidable gaps of several minutes during the league.

## Deployed compatible fixes

- `6dc3c93`: prioritize recent block headers, independently load public views,
  derive current observation from the verified Monad admission, default Watch
  agents to all modes, display the actual challenge waiting reason, and avoid
  qualification writes without an eligible opponent and compatible base block.
- `615af5d`: refresh the shipped catalogue ABI. The first deployment exposed a
  missing `registeredBlock` getter in that generated ABI; the correction and
  regression test exercise real ABI encoding rather than mock dispatch alone.
- `4e90490`: prioritize captured current tournament fixtures before historical
  reconciliation. Full references are checked; a replaced branch is not
  overwritten, unavailable reads propagate, and completed work is idempotent.

Human backend e4eceb6 remains unchanged. No contract, physics, ranking, funds,
provider capacity, or signing authority changed. The existing keeper is still
the only maintenance writer using the original operator nonce journal.

## Validation

Root TypeScript and 632 TypeScript tests pass. The web production build passed.
The small post-fix sample records live API requests at 2.47, 1.96 and 2.02
seconds and configuration at 1.93, 1.11 and 0.21 seconds. These are individual
observations, not p95 or a comparable load benchmark.

Actual public Chrome 10 and Edge 7 checks passed the complete home Watch agents
link, default All live matches, Open arena navigation and changing court frames
on 1c5 epoch 2 match 36 (NOVA/PULSE), at 14:05:39 UTC. No API response, game state
or signature was fabricated. Court selection explicitly excludes decorative
canvases. Original Chrome 8/Edge 5 failures (terminal/static sampling) and Chrome
9/Edge 6 failures (no next match within three minutes) remain in the evidence.

After the keeper fix, match 36 was captured at 14:07:06 UTC and synchronized to
the tournament at 14:07:23 (16.8 seconds later). The next admission was confirmed
at 14:08:12 after an intervening arena rotation, and match 37 appeared on the
actually renewed f868 epoch 3. This proves that sequence, not continuous uptime.

Current images: web `pongit-web:agent-waits-6dc3c93`, RPC
`pongit-rpc:waits-6dc3c93`, reader/sponsor
`pongit-agent-reusable:waits-615af5d`, keeper
`pongit-agent-reusable:progress-4e90490`. Engines remain
`pongit-agent-reusable:preview-16cf0fa` to preserve active matches. The full
pre-change backup agent-waits-20260921T1345Z and configuration/image backup
agent-waits-final-20260921T1408Z were SHA-verified off the VPS. Prior service
images, databases and journals remain available for rollback.

The contract-level house-copy correction, a completed public human-bot duel,
all tournament/endurance gates and the final unchanged 24-hour qualification
remain outstanding. The public release remains an explicitly unqualified
testnet preview.
