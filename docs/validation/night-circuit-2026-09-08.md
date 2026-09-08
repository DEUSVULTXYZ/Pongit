# Night Circuit visual revision

The rooms arena now uses a fighting-game score display: saved player portraits, individual cyan/magenta colors, italic score digits and seven illuminated result segments. Lacquered dark panels and angular light inlays replace the heavy metallic bevels. The home cards and legacy cabinet use the same palette.

The terrain artwork is painted once into a 1024x576 canvas and reused by the existing render loop. It adds faint edge lighting, corner marks and a center circle. Debug coordinates are shown only in network debug mode. The duplicate gray ball trail was removed. Physics, hitboxes, prediction, permissions, financial operations and background animation settings are unchanged.

## Checks

- TypeScript and the production Next.js build passed.
- Eight focused rooms/presentation tests passed.
- The isolated VPS Chromium flow passed with two players and a spectator: saved names and different portraits, invitation acceptance, keyboard release, F5 without another ceremony, concession, VICTORY/DEFEAT and the spectator's next turn.
- Both players' seven segments were checked against the score digits in the same rendered snapshot. The two identity areas do not overlap the central score. The court remains 16:9.
- Layout checks passed at 360x640, 390x844, 768x1024, 1440x1000 and 844x390, including above-fold home choices, label separation, keyboard focus return, reduced motion and a static background. No page errors were reported in the production-build browser runs.
- Legacy cabinet and documentation smoke checks passed. No new live financial, physical-device or latency benchmark was run for this visual change.

Final screenshots and detailed browser reports are retained privately under `artifacts/night-circuit`. The development-server preview was discarded because it did not reliably expose the connection flow in the routed browser harness; the screenshots and successful checks use the production build.

GitHub write access is restored. Public cutover still requires the Interlude operator's same-application delegation renewal test described in [the rooms runbook](../INTERLUDE_ROOMS.md).
