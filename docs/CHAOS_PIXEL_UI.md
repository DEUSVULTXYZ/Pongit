# Chaos pixel court and stable effect indicators

Reviewed: 2026-09-13

Chaos now shares Classic's beveled rectangular paddle and square ball renderer.
The secondary ball keeps its violet tint. Split paddles retain their two solid
segments and the non-colliding gap. Existing event cues and trails remain.

Two fixed indicator slots reserve their space throughout a Chaos match. An
effect stays in its original slot when the other expires. Announcements change
opacity and icon scale, without resizing the scoreboard, court or controls.
The indicators use the same purple/cyan cabinet materials as the arena.

## Validation

- TypeScript check and production Next.js build passed.
- Browser pixel comparisons at paddle heights 64, 96 and 120 found zero differing
  RGBA channels between the shared Classic sprites and baseline Chaos sprites.
  The ball corner is fully opaque, verifying its square shape.
- The old production build reproduced the mobile bug: an announcement moved the
  canvas down 35.375 px and the scoreboard up 45.40625 px at 360 x 640.
- Chrome and Edge each passed seven effect transitions at 360 x 640, 390 x 844,
  768 x 1024, 1440 x 900 and 844 x 390. Canvas, scoreboard, controls and page
  position remained unchanged, with zero measured movement.
- Empty slots, announcement, activation, long names, two simultaneous effects,
  second-slot-only and removal were exercised. All 24 effect names were displayed.
- Chrome also passed with animations enabled; reduced motion and disabled effects
  passed separately. Countdown, F5 during acceptance and both result screens passed.

Reports: [Chrome](evidence/chaos-pixel/chrome.json),
[Edge](evidence/chaos-pixel/edge.json),
[animations enabled](evidence/chaos-pixel/chrome-motion.json),
[sprite pixels](evidence/chaos-pixel/sprites.json).

These are real browser tests against the production build captured from a private,
temporary VPS container. API and chain responses are simulated. This UI-only
release changes no physics, contracts, account permissions or payment rules.

## Deployment and rollback

Only the web container is replaced. Keep the relayer and indexer running and
retain `pongit-web:9a79046` for rollback. Restore that web image in the release's
compose override and run `docker compose up -d --no-deps --no-build web`.
The private backup `20260913T202521Z` was copied off the VPS and its database
SHA-256 checksums verified. No database migration is required.
