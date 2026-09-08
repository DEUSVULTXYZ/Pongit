# Pixel Palace visual implementation

The approved B direction is implemented in the rooms homepage and arena: three original pre-rendered 3D illustrations, cyan/magenta/gold selection keys, stepped nine-slice enamel frames, a static voxel arcade room and matching player/score displays. The legacy arcade inherits the same room and surface palette. Documentation keeps its independent reading layout.

Michroma, the original logo, player avatars, saved audio preferences and all interaction flows are preserved. Decorative artwork has empty alt text and no focus or pointer handling. Each whole selection card is a single button; the colored key inside it is decorative, not a nested button. Mobile cards become horizontal and keep all three actions above the fold at 360 x 640.

Paddle and ball bevels are painted inside the existing hitbox rectangles. The court remains 16:9. Its dot matrix and pixel corner details are baked into one cached canvas. No 3D renderer, extra frame loop, physics change, authorization change or financial change is included.

## Verification

- TypeScript passed locally and in the production build. Next.js generated all 36 static pages successfully.
- Twelve focused rooms and presentation tests passed, including input reversals, bounded prediction, jittered observations and room rotation.
- The private VPS production-build browser check passed at 360 x 640, 390 x 844, 768 x 1024, 1440 x 1000 and 844 x 390. It checks above-fold choices, label separation, no horizontal overflow, loaded artwork, centered key icons, reduced motion, static background and keyboard focus return.
- Legacy homepage and documentation smoke checks passed. No game canvas, audio element or decorative model is loaded by the docs.
- The final HTTPS-origin test with two players and a spectator passed: account creation, saved usernames/avatars, invitation acceptance, automatic first-duel entry, 16:9 court, score segment agreement, keyboard release, F5 without another passkey ceremony, locked result backdrop and spectator rotation.
- The first multiplayer attempt reached the correct next proposal but a test asserted visibility before React processed the notification. The test now waits for that visible state, using the existing bounded wait helper. The repeat passed. No application exception was observed in either attempt.

Screenshots and machine-readable reports are retained privately under `artifacts/pixel-palace`. Source artwork and generation prompts are in `artwork/pixel-palace`; `scripts/pixel-palace-assets.mjs` builds the optimized web assets and vector frames. The shipped art set is under 500 KB, including both responsive sizes and the room background.

These checks use Chromium and virtual PRF authenticators. No physical-device, Edge/Safari, new latency benchmark, contract differential or financial-flow test is claimed for this visual-only change.

## Release boundary

The preview uses isolated services on the VPS. The production release is unchanged. `pongit-web:pixel-palace-candidate` retains the compiled candidate, and `pongit-web:night-candidate` remains available for preview rollback. The Interlude same-application renewal gate in [the rooms runbook](../INTERLUDE_ROOMS.md) still applies before public rooms cutover. Repository publishing access has already been restored.
