# Ranking, provider credit and ball trail

The arcade identifies its provider through a single bottom credit, “Powered by InterludeLayer”, linking to the provider site. Player-facing menu, status and tools labels use game terminology. Technical documentation and deployment identifiers retain the actual integration names.

Ranking is a direct header action and no longer requires a passkey to read. It presents current Classic ELO, original Chaos ELO and previous Classic ELO separately. The current rating and its published copy remain distinguishable. Only public profiles and verified ranked results are exposed; contacts, room state and mutations remain authenticated. A shared short-lived request cache avoids repeating engine queries for every visitor.

The ball now leaves a short cyan/violet pixel trail based on positions already rendered. It does not run a second physics simulation, change hitboxes or affect collision timing. History is bounded to 20 samples/120 ms and cleared on points, match changes, replay seeks, large corrections and tab suspension. Reduced motion disables the trail.

Validation: TypeScript, a production build, 15 focused TypeScript tests and the separately recorded Chaos preparation checks passed. The [Chaos migration record](../CHAOS_ROOMS.md) describes what is prepared and what is still unavailable; this release does not activate Chaos rooms or new betting contracts.

Private browser checks passed at 360, 390, 768 and 1440 pixels, plus landscape. Ranking can be opened while disconnected; tab changes, ELO cells, published-copy labels, focus return and the single linked provider credit were checked. The ranking layout uses synthetic rows in this isolated browser test, not invented public standings. An initial mobile check found overlapping Ranking/More grid cells; each now has its own column, and the repeat passed. All three home actions remain visible at 360 x 640.
