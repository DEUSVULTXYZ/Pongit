# Agent spectator rendering, 21 September 2026

The user's missing-ball/slideshow report was reproduced against the public service. The former screenshot-hash check only proved that pixels changed; it did not establish visible ball movement.

## Causes and changes

The public engine probe observed the requested clock up to 2,610 ms ahead of processed physics. The spectator renderer projected from that requested clock to an unconfirmed goal outside the canvas. Agent ticks also waited for shared Monad planning reads, reset their progress timestamp twice, and periodically blocked on lifecycle checks.

Published web product `fa7a5b1` buffers processed snapshots for spectators, interpolates paddles and uses processed game time for projection. Unconfirmed Classic goals remain at the visible edge. Duplicate observations do not create freshness; an actual outage still stops the display. The buffer does not invent scores, effects or commands. Human controls and contracts are unchanged.

Controller products `0dc1b14` and `b80bee9` refresh planning observations in the background, with a five-second hard maximum age. Progress is timestamped when its snapshot arrives. New, durably journaled but unsent commands skip an impossible receipt lookup; uncertain/restarted commands still reconcile their exact receipt and bytes. Pending/latest nonce reads are parallel, and must still agree. Lifecycle fences are prefetched but retain their original three-second validity: expired, failed, closed or reorganized checks cannot authorize a new send. Idle cooling arenas no longer attempt hosted provisioning after a controller restart.

## Actual public evidence

All browser samples used real public admissions and engine events, with no mocked response or synthetic match. Each measured window lasted 12 seconds after a four-second warmup. Ball draw coordinates and animation-frame timings were recorded, rather than just screenshot differences.

| Version / sample | Visible ball frames | Moving frames | Frame time p95 | Longest stationary run |
| --- | ---: | ---: | ---: | ---: |
| Before, Chrome, match 38 | 56.6% | 40.4% | 17.2 ms | 4,033 ms |
| Web only, Chrome, match 40 | 100% | 60.2% | 18.6 ms | 1,663 ms |
| Web + controller `0dc1b14`, Chrome, match 41 | 100% | 80.6% | 18.8 ms | 1,082 ms |
| Final, Chrome, match 42 | 100% | 90.1% | 19.0 ms | 748 ms |
| Final, Edge, match 42 | 100% | 92.6% | 19.0 ms | 766 ms |

These are short sequential windows in different Classic matches, not a controlled load benchmark or a 24-hour availability claim. All used arena `0xf868bdb4669f4de471555ccadc3bac5589a3fcaa`, epoch 3. The final controller journal sample contained 129 tick entries, with approximately 550 ms mean spacing, 669 ms p95 and 1,133 ms maximum. This spacing includes the network and local scheduling; it is not an Interlude quota measurement.

The initial post-web runs found no active match between fixtures, then a further pair failed the stationary-run limit. Those failures are retained alongside the subsequent passing results in `artifacts/qualification/20260921/agent-spectator`. Remaining subsecond holds were measured, not hidden. Chaos-specific obstacle/multiball fluency and the complete Agent Arcade qualification are not established by these Classic windows.

## Validation and deployment

- Root TypeScript and 642 TypeScript tests pass, including uncertainty/restart/nonce, background-read expiry, prefetched closure and rendering-buffer regressions.
- Production Next.js build for the web product passes. Staged secret scans pass.
- Public `/`, `/agents`, `/agents/tournaments` and `/docs` return HTTP 200.
- Web: `pongit-web:spectator-fa7a5b1`, image `sha256:cf1921804692ac59ab1e4aef346424db04d32ce115fe633d9c004cc7f03374b4`.
- Agent engines: `pongit-agent-reusable:spectator-b80bee9`, image `sha256:b470f8c99d8fd1cfb4d97fbb88cad6c5880aece85434c916f616d1775ad835db`. Reader, sponsor, keeper, human backend and deployed contracts are unchanged.
- Backups `spectator-20260921T1421Z`, `spectator-controller-20260921T1433Z` and final configuration `spectator-final-20260921T1442Z` retain the prior web/controller configuration and the agent database. Copies are hash-verified outside the VPS.
- Roll back the web to `pongit-web:agent-waits-6dc3c93` and the agent engines to `pongit-agent-reusable:preview-16cf0fa` using the existing compose projects. Preserve the live database, nonce journals and other services; do not restore old private writers.

The human backend remains `human-e4eceb6`. No arena, delegation, result or financial contract was replaced. Public Agent Arcade remains a testnet preview; house-bot friendly instances, community qualification, replay reconciliation and the final unchanged 24-hour trial remain separate outstanding work.

## Actual Chaos windows, 16:59 and 17:01 UTC

The mode-selectable read-only browser check in `c47128a` measures the primary
white ball separately, so a multiball draw cannot inflate movement by jumping
between two ball positions. No page response, physics or match was mocked.
Both browsers observed public Chaos match 61 on `7fb…` epoch 2, using the same
web `fa7a5b1` and controller `b80bee9` plus the compatible `f30eb5a` publication
health overlay. The public tick cadence remains unchanged.

| Browser | Samples | Visible primary-ball frames | Moving frames | Frame p95 | Longest stationary run |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chrome | 719 | 99.86% | 80.22% | 18.0 ms | 733 ms |
| Edge | 717 | 100% | 60.20% | 18.2 ms | 1,301 ms |

Each was a 12-second sample after warmup, at 1280×900, run sequentially in a
temporary container with 0.7 CPU and 900 MiB memory. The Chrome window displayed
BANK SHOT. Both meet the existing test thresholds, but Edge is close to the
movement threshold and noticeable holds remain. This is not complete coverage
of all 24 effects, mobile viewports, every match or continuous 24-hour service.
Reports are in the house-instance qualification evidence directory; raw frames
and screenshots remain in the public release's private diagnostics directory.
