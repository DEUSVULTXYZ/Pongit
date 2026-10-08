# Responsive production release — 8 October 2026

Status updated 8 October 14:38 UTC: all eleven current nodes recovered with verified identities and publication. Human admissions and tournaments are reopened. Agent controls and presentation fixes remain deployed; human tick corrections are undergoing actual public PvP qualification. Public qualification remains false. The scheduled automation remains paused. No new delegation was closed during this intervention.

## Runtime and preservation

- Gameplay web: `5486a5faab7366639307bea3652f51095cc0866b`; image `sha256:bbddf11371df3c99949d08a35bdb262ad8aa9cedcca20651e9d63e87941ace73`.
- Agent engine: `d55833436dbaff7743bc80c3aa817ba4e0dadf57`; image `sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d`.
- Human relayer: `c45f25e`, image `sha256:9b4929eda2faa243b8c4d1fe3f2bd56a9500501c3b029647af10db76ac85d88d` (includes human tick fixes `1714782` and `0b1a599`).
- Other active services: `eb423745a346bf12c63ae8ba9b262dbc8451fb44`. SDK 0.2.3; Node 24.21.0; hub v3 `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e`.
- Rules 17 agent pool: `0xe01c31f482113367c510a04816ff371676477fa3`.
- Rules 18 human lobby: `0xdf44e1cae317bc9d8bafcf9b292b08bb90996fb7`.
- Agent catalogue: `0xae269a752b511da962c66c7a6c4161ef1e038806`; tournament book `0xdff3d7554a1ea914173eb3296bc7efb76d37db01`; shared ratings `0xeac32f27c3b5ceaee12555bad47b4d013f17e1e1`.

The actual public migration preserved 938 results, 194 requests, 43 tournaments, 742 fixtures and 9 identities. Human migration preserved 7 results, 28 ratings, 20 initial seeds and 8 pair seeds; historical financial contracts, claims, references and 26 grants remain available. Public match 901 still resolves its original contract and its 2–7 result. This preservation proof is not a new human payout test.

## Calls removed and retained

Active v3 decisions and signing fences reject automatic `undelegate`, `forceClose`, `closeEngine` and `closeReusableArena`: no age rotation, failed-node replacement closure or cancelled-tournament closure. Live points and new matches reuse the same epoch. Initial openings remain necessary; `releaseStake` only reconciles already-closed delegations after canonical deadlines. No new release was requested here. Current epochs have `expiresAt=0`.

Finance, ratings and result capture remain outside delegated gameplay slots and follow publication asynchronously. Published results are still contestable; publication is not protocol finality. Historical payment generations and corrections are preserved. The 65,536-result accumulator limit closes admissions for that arena, never its delegation automatically. See [call inventory](continuous-delegation-inventory-20261005.json) and [continuous-delegation audit](continuous-delegation-20261005.md); their older runtime measurements are historical.

## Demonstrated causes and corrections

| Symptom | Evidence and correction |
| --- | --- |
| Countdown pauses | 901 recorded three contractual pauses, first after 0.5 s. Cold command preparation and render-dependent presence were removed from the critical path. Rules 17 waits for actual readiness; presence wakes every 100 ms and keeps the original 500 ms protection. |
| Mobile pauses and sluggish commands | Actual 967/968 trials and a 72-sample probe isolated Chromium's unconsumed touch handling: WS p95 about 94 ms / HTTP about 108 ms. Native nonpassive touch consumption on gameplay controls reduced the probe to about 9 ms and removed pauses in subsequent normal games. |
| Paddle resistance | Visual reconciliation no longer subtracts correction velocity from held input. Rules 17/18 use 300 units/s; historical rules keep their original speed. Local release immediately stops integration and cannot resurrect an old intention. |
| Resistance under added latency | 985 exposed local movement incorrectly capped by an old presence clock ceiling. 5486 separates visual paddle frame time from the ball clock fence, while actual pause/stale/finished states still stop movement. |
| False or reversed contact presentation | Pending input cannot confirm a bounce, sound or score. Prediction stops at uncertain contact; received collision history persists. A missed ball outside the paddle plane cannot reverse solely because an offset decays. 901's replay cannot reconstruct its unrecorded client prediction; new instrumented trials supply that evidence. |
| Apparent resync at ordinary points | Point, serve, Chaos draw, stale stream and true contractual pause have separate causes. Normal points retain the connection, clock and court. |
| Vanishing passkey error | Restored virtual PRF failure was erased by background control recovery. Explicit owner-action errors now remain visible until retry/dismissal. Fresh owner revocation/renewal and unsupported-PRF recovery were tested separately. |
| Small court/header | Pixel header, compact scoreboard and reserved effect areas. Actual 1440×900 court is 1166 px wide; actual 1366×768 meets 900 px. Historical replay tests also meet desktop size gates. |

## Before and after

[Seven natural matches](responsive-motion-normal-20261008.json) on the same 5486 web and d558 engine: five Chaos/NOVA and two Classic, visible Chrome/Edge, actual keyboard/CDP touch, independent observers, no mocked game state. Canonical block 69240028 verifies all seven published results. Mobile sizes are emulated; no physical handset or physical authenticator claim.

| Measure | Observed final normal suite |
| --- | --- |
| Countdown/runtime pauses, abnormal resyncs | 0 |
| Unconfirmed visible paddle contacts | 0 of 49 |
| Maximum admission across seven games | 7.304 s |
| Worst local response p95 | 16.8 ms |
| Worst send p95 | 18 ms |
| Worst independent observer reception p95 | 12.95 ms |
| Held speed | 100% of contract speed outside bounds/effects |
| Worst release drift p95 / maximum | 0 / 0.630 units |
| Longest player / observer hold | 99.5 / 116.5 ms |
| Worst frame p95 | 17.1 ms |

The separately labelled 150 ms RTT plus jitter trial 987 finished naturally with no pause, no false contact and 16.6 ms local response. It retained 9.316 s admission, four snapshot jumps and 383.4 ms maximum hold; these are degraded limitations, not normal-network passes. [Full report](responsive-degraded-repeat-20261008.json).

Original failed trials remain immutable. Measurement corrections require exact evidence: HTTP contact counter plus last hitter/live velocity, confirmed shield events, exact server-confirmed paddle growth at a wall, and actual paint timestamps. They do not waive an unexplained jump or invent a command. See the retained baseline/contact/geometry reports.

Current product verification includes 1096 TypeScript tests/root typecheck, prior 1099 Solidity checks with 8 explicitly skipped external scenarios, 24 effects / 276 pairs, 10,000 Classic and 20,300 Chaos comparisons. 16 additional focused measurement regressions passed. The eight-bot offline calibration is monotonic; it is not eight new hosted human matches.

## Recovery, backups and remaining gates

Current-build F5 match 998 and actual disconnection match 999 passed with natural published results, zero new passkey assertions and one intentional protective recovery each. The independent observer verified frozen score/time during the outage. [Canonical fault proof](responsive-motion-faults-20261008.json).

Final backup `backup-feedback-final-9`: five database dumps and runtime configuration, 75,646,875 bytes in six files; SHA-verified off VPS at 11:19:18 UTC. Manifest `6bdac514087569d128223908a4b668ae5dac23ff748ee7b07aff212aafaf1432`. Earlier actual restoration of all five drained database dumps passed in isolated scratch databases. New copies are SHA-verified, not described as a second restoration unless actually restored.

Compatible web rollback: after verifying idle lanes, replace only `arcade-web` in the canonical and mirrored Compose with retained image `sha256:53333cc77fef7916c8b41bde2d62ea279548495a9cd58939c98f9a8e140cfe08`. Keep current contract manifests, no-close guards, databases and all nonce journals. Never restore an old database over new results. Keep agent engine/signers unchanged unless a separately verified compatible rollback is needed.

Earlier observation, resolved by 13:49 UTC: seven Interlude directory entries were stopped despite Active epoch 1 delegations. Four peer nodes execute and publish under the same runtime. Direct failed endpoints time out during TLS before HTTP. One owner-authorized creation/adoption attempt per stopped agent was already journalled; no repeated creation or closure is being used as a workaround. [Minimal provider reproduction and affected addresses](interlude-stopped-nodes-20261008.md).

Two natural PvP games and the disconnected Chaos payout now pass at canonical block 69283990; see [PvP evidence](responsive-pvp-20261008.json). Five agents plus two humans and the unchanged all-role 24-hour qualification remain unproved. The seven hosted nodes have since recovered without undelegation or redeployment; all eleven identities are verified at block 69270955. Public tournaments and human admissions are now enabled. Three earlier Classic PvP render failures remain preserved. The c45f25e human-only tick fix passes the subsequent Classic and Chaos runs. See [recovery evidence](responsive-hosting-recovered-20261008.json) and the detailed migration checkpoint. At canonical block 69240854, operator reserve is 49,569.57387803 test MON, archive reserve is 95.212388706 and sponsor reserve is 109.313190646 MON. This is a balance observation, not a guarantee of 24-hour cost. No additional funding request is needed.

Manual checks still required: real physical keyboard/player feel, physical touch/landscape on a handset, and a real authenticator's PRF/session recovery. Automated browser evidence and virtual passkeys are not substitutes for those hardware checks.
