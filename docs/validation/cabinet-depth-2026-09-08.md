# Cabinet depth visual release candidate

The three lobby actions now use original SVG cabinets drawn in perspective. Machined edges, recessed glass, separate cyan/violet/rose lights and raised controls give the interface depth. The existing public cabinet and the Interlude lab share the new materials. Documentation keeps its reading surface.

Paddle and ball bevels are painted inside their existing rectangles. Collision dimensions, timing, prediction, contract rules and financial permissions are unchanged. No 3D engine, shader loop or animated background was introduced.

## Validation

- TypeScript check and production Next.js build passed.
- Eight focused rooms/presentation tests passed.
- Chromium layout checks passed at 360x640, 390x844, 768x1024, 1440x1000 and 844x390. All three choices fit above the 360x640 fold, with no horizontal overflow or model/label overlap.
- Keyboard activation, modal focus return, reduced motion, decorative SVG accessibility and the static background were checked.
- The multiplayer browser flow on the isolated VPS passed with two virtual-passkey players and a spectator: invitation acceptance, direct controls, F5 session recovery, concession, VICTORY/DEFEAT and spectator rotation. The court remains 16:9, with no footer below it.
- The existing cabinet route was inspected at 360 and 1440 pixels; documentation loaded without a game canvas, audio element or cabinet models.
- Secret audit: 1,055 historical/index objects scanned, no known-secret or high-confidence pattern findings. No dependencies were added.

An initial mobile capture revealed an older grid rule overlapping the labels. The final build increases selector specificity and the browser check now verifies model/label separation explicitly.

Screenshots and detailed reports are kept in the private VPS test directory and local ignored `artifacts/cabinet-depth`. Layout captures use the final production build. The multiplayer run preceded the final home-only grid correction; game rendering did not change between those builds.

## Availability and limits

This is a private VPS release candidate. The public homepage remains unchanged while GitHub publishing access and same-application Interlude delegation renewal remain unresolved, as recorded in [the rooms runbook](../INTERLUDE_ROOMS.md).

Mobile coverage uses browser viewport emulation. No physical-device or separate Safari/Edge run, subjective audio review, or new latency benchmark was performed for this visual change. Financial flows and contracts were not modified.
