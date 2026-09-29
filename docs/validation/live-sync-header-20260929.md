# Live synchronization and pixel header — 29 September 2026

## What was wrong

Fast input acknowledgements did not prove smooth rendering. The original player
clock froze at its prediction limit and jumped forward when a late snapshot
arrived. A sixteen-frame spectator buffer also lost its temporal reserve during
bursts of inputs. Countdown observations could incorrectly consume that reserve
before any game time had progressed. Separately, the agent's nominal 300 ms tick
cadence included its receipt/journal latency again, yielding about 531 ms between
ordinary ticks.

The shared header retained rounded controls. The initial replacement also exposed
a stacking problem: isolating the header trapped the fixed ambience above page
content. This was caught in browser checks and removed before deployment.

## Changes and scope

Implementation commits: `614cf52` and `cafce6a`. No contract, physics rule, financial
permission, deployment address, or historical result was changed.

- Players use a short ordered presentation timeline; their paddle responds locally
  without waiting for that timeline. Extrapolation remains bounded at 600 ms and
  cannot award a point or invent a serve.
- Spectators keep three seconds of confirmed history, capped at 512 entries.
  Their initial fill is at most one second, shown as synchronization. Countdown
  time cannot substitute for buffered game time. Subsequent clock corrections
  slew at 98–102% rather than teleporting.
- Score, effects and terminal presentation follow the displayed timeline.
  `Outcome` explicitly defers its terminal transition instead of losing its
  playing state. Cancellation and a hidden/replaced court cannot strand a result.
- The agent tick interval is measured from submission, preserving newer observed
  player progress, lifecycle fences, publication guards and nonce ownership.
- The common header uses the existing pixel frame, square controls, visible focus
  and 44 px touch targets. Mobile height is 114 px. Landscape play prioritizes
  the court. The fixed background and audio remain.

## Actual hosted tests

These used real public APIs, Monad and Interlude, with candidate web assets and
virtual PRF authenticators using the real Mera SDK. No physical passkey claim.
Receipt latency is not substituted for render measurements.

| Test | Result | Local p95 | Receipt p95 | Render p95 | Longest in-play hold |
| --- | --- | --- | --- | --- | --- |
| Chaos 201, old rendering | PASS controls/result; rendering jumps | 15.9 ms | 17.8 ms | 17.3 ms | 401 ms, plus two snapshot jumps |
| Chaos 203, intermediate timeline | PASS controls/result; fluidity FAIL | 15.2 ms | 15.4 ms | 17.3 ms | 933 ms |
| Chaos 204, corrected tick cadence | PASS controls/result | 15.9 ms | 19.4 ms | 17.3 ms | 450 ms player; spectator F5 still failed |
| Chaos 205, corrected spectator startup | PASS controls/F5/result | 15.4 ms | 17.6 ms | 17.3 ms | 250 ms player; 450 ms spectator after initial fill |
| Human Classic, two players and spectator | PASS countdown/F5/7–6 on all clients | separately instrumented | accepted controls verified | 17.7/17.6/17.3 ms | 317/333/316 ms after initial spectator fill |

No snapshot-boundary jumps or frame gaps over 500 ms were detected in the final
Chaos and human Classic samples. These are bounded samples, not an endurance or
zero-desynchronization guarantee. The raw spectator traces include initial fills
of approximately 899 ms (Chaos) and 813 ms (Classic); these are startup buffering,
not removed evidence. The final build exposes and labels this fill explicitly.

Chaos 205 reference:
`10143:0x40178b386730985a9d1df46c3a811f8e7138e4ec:5:205`.
Human reference:
`10143:0xa429e8e01c4b57dddfc6e8c75094cb68333f7f2f:45:340282366920938463463374607431768211528`.

Engine journal comparison (all ticks, including control/reload gaps): median tick
spacing 531.3 ms for match 201, 329.4 ms for 204, 331.7 ms for 205. Sample counts
33/50/51. Journal completion p95 136.3/128.5/128.6 ms.

Evidence: `artifacts/qualification/catalogue-sync-*`,
`artifacts/independent-candidate/browser-sync29c2`, and
`artifacts/qualification/sync-measurements-20260929.ndjson`.
All prior failed trials are retained. The first human driver attempted to click
Accept after automatic acceptance and failed. Its recovery attempt found the
already completed 7–6 match and was stopped without a gameplay pass. The next
fresh driver passed. The intermediate UI assertion expected Live before the new
one-second buffer filled; the corrected check still holds the catalogue unresolved
and requires Live within 2.5 seconds.

783 TypeScript tests, root typecheck, 19 focused playout regressions, production
web builds and secret scans passed. Contracts were unchanged; this does not claim
a new 10,000-case Solidity comparison run. Browser fixture checks cover Chrome
and Edge, 360/390/768/1440 px and 844×390 landscape, touch, zoom, focus, reduced
motion, countdowns, effects without layout shifts, results and replays.

## Backup and rollback

`sync-final-20260929T1452Z` has SHA-verified copies outside the VPS:

| File | SHA-256 |
| --- | --- |
| agents.dump | `562c945bf2ff820c97a64d00afb8cf6f6d970f142b40aa7a3c3fd4f68b51eb6f` |
| operator.dump | `5b84a8493fee6ddb09ec8b1530b5161de4b47e42751876cb9df4f015d7c9135e` |
| runtime.tar.gz | `e1c9da4b70db933740c2f8dd72862d54a73d001fac52f108afeccb7734540d2e` |

The exact dumps restored to isolated scratch databases: 8,630 lifecycle jobs,
7,538 agent engine jobs and 20 result commitments were readable. Only the scratch
databases were removed. Never restore old data over newer transactions.

The cadence engine image is
`sha256:4fd0be526c4a8f75bdd3111f6b3326f14c053b91a087582323ed57cf4aba9e6e`,
deployed at 14:29:51 UTC without an active challenge. The prior engine image is
`91808a44b73c4f69a40e5f1552953c14539faa8da255c23bf0fff7d4772a7af3`.
The human backend's image, start time and restart count remain unchanged.

## Remaining limits

Admission still misses the 8-second target: the latest candidate Chaos samples
took 32.9 and 47.2 seconds. Bot difficulty contracts and the protected unpublished
f202 tournament result are not changed by this patch. No forced cancellation was
sent. The continuous 24-hour qualification, a new real human Chaos financial run,
and the full migration remain unqualified.

Publisher balance was 180.383509657116693993 test MON at 14:55 UTC. Each current
24-million-gas publication costs 2.448 MON. No additional transfer was made during
this synchronization operation. A request for 1,000 test MON to the controlled
PONGIT account, and authorization to fund publication, is pending. Avoid starting
more paid trials until a sufficient reserve is verified.
