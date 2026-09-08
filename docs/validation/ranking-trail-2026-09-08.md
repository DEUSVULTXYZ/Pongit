# Ranking, provider credit and ball trail

The arcade identifies its provider through a single bottom credit, “Powered by InterludeLayer”, linking to the provider site. Player-facing menu, status and tools labels use game terminology. Technical documentation and deployment identifiers retain the actual integration names.

Ranking is a direct header action and no longer requires a passkey to read. It presents current Classic ELO, original Chaos ELO and previous Classic ELO separately. The current rating and its published copy remain distinguishable. Only public profiles and verified ranked results are exposed; contacts, room state and mutations remain authenticated. A shared short-lived request cache avoids repeating engine queries for every visitor.

The ball now leaves a short cyan/violet pixel trail based on positions already rendered. It does not run a second physics simulation, change hitboxes or affect collision timing. History is bounded to 20 samples/120 ms and cleared on points, match changes, replay seeks, large corrections and tab suspension. Reduced motion disables the trail.

Validation: TypeScript, a production build, 15 focused TypeScript tests and the separately recorded Chaos preparation checks passed. The [Chaos migration record](../CHAOS_ROOMS.md) describes what is prepared and what is still unavailable; this release does not activate Chaos rooms or new betting contracts.

Private browser checks passed at 360, 390, 768 and 1440 pixels, plus landscape. Ranking can be opened while disconnected; tab changes, ELO cells, published-copy labels, focus return and the single linked provider credit were checked. The ranking layout uses synthetic rows in this isolated browser test, not invented public standings. An initial mobile check found overlapping Ranking/More grid cells; each now has its own column, and the repeat passed. All three home actions remain visible at 360 x 640.

## Public deployment

Commit `8f9ddc336ca263c06ab6227ee5b214a4477954e0` was published and deployed to `https://pongit.xyz` on 8 September 2026. Web and relayer images were replaced after a private backup; production and rollback images were retained. No contract or database schema changed.

The post-deployment browser pass used actual HTTPS API responses, with no ranking fixtures, at 360, 390, 768 and 1440 pixels. Anonymous ranking access, actual original Chaos ratings, the linked bottom credit, modal closure and overflow checks passed. Public ladder reads returned 200; private contacts and room state still returned 401 without authentication.

A second public pass used two players and a spectator with virtual PRF authenticators. Nine checks passed: above-fold home actions, account creation, private notifications, invitation acceptance, automatic spectating and next-turn consent, a 16:9 court without a footer below it, keyboard release delivery, F5 session reuse, and result dialogs with the background locked. All test accounts left their room afterward. This is not evidence of physical-device passkey recovery or the unimplemented Chaos financial transport.

The candidate Chaos contract and signing protocol added afterward do not alter this deployed release. Their separate checks are recorded in the [migration status](../CHAOS_ROOMS.md).
