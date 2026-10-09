# Match 1509: contact rendering and frame timing

The production web image was updated on 9 October 2026 at 13:46:14 UTC from commit `5b9e6e43d718e62d39340dcbb4289be97efcc60b`. This includes the earlier contact correction in `2499ce1`. Contracts, the engine, command ownership and delegation were unchanged.

## Evidence and causes

Match 1509 finished 7–6 with no contractual pause. Its retained replay contains 695 frames, including a simultaneous multiball sequence. The Solidity/TypeScript reconstruction agrees on the two balls: one misses and the other hits. The original user's predicted browser picture is not in the replay, so this alone does not disprove the reported visual crossing.

Actual headed browser tests subsequently reproduced a painted ball crossing a painted paddle in match 1529. The ball was waiting at an unresolved contact while the paddle picture continued on a different timeline. Follow-up tests exposed corrections that snapped a paddle to an unnecessarily exact contact position. The renderer now constrains each incoming ball independently and keeps the nearest paddle position compatible with the authoritative hit, miss or split-paddle segment. It does not move the ball to invent a hit. Both simultaneous balls constrain the same displayed paddle consistently.

The stronger actual-paint timing check then detected another real defect in match 1597: the remote paddle advanced 15.03 units between canvas paints only 0.4 ms apart. The RAF callback timestamps advanced 50 ms while execution was delayed. Local input and remote prediction used different clocks. The complete court now samples `performance.now()` once at draw entry, including immediate input paints. The ball and both paddles share that actual frame time. See [the recorded trace](responsive-render1597-20261009.json) and the [browser timestamp semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#parameters).

## Validation status

The candidate passed 1,250 TypeScript tests, root type checking, the Linux web build and the secret scan. Headed production series 72 passed all seven natural games: five Chaos against NOVA and two Classic. All reported zero pauses, abnormal resynchronizations, unconfirmed paddle bounces and painted paddle crossings. These games did not draw multiball, so that specific coverage remains a separate gate. See the [seven-game evidence](responsive-series72-20261009.json).

All previous failed reports, videos and traces remain intact. Earlier series 70 results must not be presented as complete validation: the stronger paint-time check found a previously hidden remote jump in match 1585. The isolated observer-delay failure in match 1576 remains unresolved and was not reproduced by the independent read-only wire probe. No final 24-hour qualification has started.

## Deployment and recovery

The new image is `sha256:ec309447cf7503fdbc020e4b0c2f0c2f7925c849ca04f645a15e4d7cc4a4a2c5`. The guarded deployment waited for natural match completion and verified an idle canonical state at block 69554762 before changing the web image. All services resumed. No match was cancelled and no delegation was closed.

Backup `backup-entry-66` contains five databases and the runtime configuration: 340,222,333 bytes, verified off VPS at 13:44:04 UTC. Its manifest SHA-256 is `6fc1c245ecbffea165f762d55748719726d286c33c6bb529a829c0c87b8e3867`. The earlier successful five-database restoration evidence is retained.

The immediate service rollback is web65, image `sha256:a77553468d9ccd77922be179a4f8cce3683071d311866d2fca89aabcaf7da8cc`. Revert only the web image in the canonical Compose file and its recorded mirror, after an idle boundary. Do not restore an old database or erase subsequent results and journals. That rollback retains the known old frame-timing limitation.

The scheduled automation remains disabled. Browser passkeys and mobile interactions in these tests are virtual/emulated, not physical-device evidence.

## PvP regression and compatible follow-up

The same stricter test failed in natural Classic PvP, with 40.2-unit and 22.66-unit local contact corrections. `IndependentHub` was not wired to the event-time local-input ledger already used by Agent Arcade. It still rounded local motion to frames. Commit `bea0e243c3703a2bdf72375cb633ee52d6aef82e` connects its input events, retained local history and immediate paint subscription. This changes only the PvP component; the tested agent rendering code is unchanged. The [original failed measurement](responsive-pvp72-20261009.json) remains intact.

Web67 was deployed at 14:09:50 UTC: `sha256:d45f3c2de3248a3702b005698ae167806e53f27e1e698bbfbc47eaa82b8f7a2c`. The guard waited for natural completion and confirmed idle block 69559404, hash `0x02cb29f91ab42771d7bffed13d2fa009cf170e75a50e2355d8ffafeef4ad0d2e`. All backend services, contracts, delegations and nonce authorities are unchanged. Forty-five focused tests, root type checking, the Linux build and secret scan passed. PvP73 finished: Classic passed, but Chaos failed its ball-continuity and collision-picture gates. These failures remain intact; no passing result is inferred from deployment.

Backup67 contains five databases and runtime configuration, 343,304,459 bytes, verified off VPS at 14:07:57 UTC, manifest `ae8da63152ed070b2143f9d0076e38f21dcb9d4aa6574c1d55a2476e55c6080c`. Its immediate rollback is web66 (`ec309447...`), using the same service-only procedure. Retain all data written since backup.


## Confirmed shield path and late contact correction

The actual Chaos PvP73 trace contains a Last Chance shield collision at x=15.999451 followed by a bottom-wall collision at x=35.99601. The renderer had held the incoming ball at the paddle plane, then blended directly to the already-outgoing state. This skipped the confirmed path behind the paddle and drew an incorrect paddle rebound. Another late confirmed paddle hit moved the ball 31.16 units in one 16.7 ms frame because its correction had a fixed 80 ms deadline.

Candidate `0df141f9e274d07cf5815a17003226584f790649` preserves confirmed per-ball collision waypoints and limits additional catch-up speed to 120 units/s. Simultaneous balls retain independent routes. Human rules18 also use the approved 50 ms idle physics pilot, skipping a tick after commands have advanced the game. The single nonce owner and legacy cadence are preserved. The two captured failures reproduce before the fix; 57 focused tests, all 1,254 TypeScript tests, type checking, Linux build and secret scan pass afterward. Hosted browser verification is still required.

The disconnected Chaos73 wager was settled automatically at canonical block 69560883, transaction `0x79a5f97c61029efb8b1a15ef2db2213f95ad3b060bba7396b2b3cf148d5d156c`. It was a losing wager with zero amount due. Both duplicate claim paths reverted. This proves zero-value settlement and deduplication, **not a positive payout transfer**.


## Web68 rollout

The shared contact fix was deployed on 9 October at 14:38:44 UTC. Image: `sha256:e9aeaa2a9e4d2b4577f7b04e630ac0153a33550fc979215313f60f16726bf739`, source `0df141f9e274d07cf5815a17003226584f790649`. The guard verified an idle canonical block 69565140 (`0xd73070b6d53fd1fc7c0ac4daeeac9f7f1374ebfdadb1ad0f0bc76ec982a0b38f`) and changed only the web service. Existing games completed naturally; contracts and delegations were not closed.

Backup68 contains 346,199,300 bytes across five database dumps and the private runtime archive, SHA-verified off VPS at 14:37:39 UTC. Manifest: `7186e334c085b273e335e502fb556b62dacc1a19f6cbf3ab1df8f63924c85b5f`. Immediate service rollback is web67, image `sha256:d45f3c2de3248a3702b005698ae167806e53f27e1e698bbfbc47eaa82b8f7a2c`; preserve all subsequent database writes. This rollback restores the previously documented contact limitations.

PvP74 is the only running browser driver, with an original deadline of 15:09:04 UTC. New normal-agent and multiball series74 are prepared but have not run. Earlier successful series72 does not qualify this changed shared renderer.


## PvP75: redundant browser physics delayed a release

PvP74 failed before gameplay because its test read the clipboard before the asynchronous room-link copy finished. The preserved failure is separate from gameplay. The corrected bounded PvP75 Classic ended naturally5-7; all render, input, pause and peer-latency gates passed except one true painted paddle crossing on the local client.

At that contact, a browser tick took155.4ms to return. The key release waited behind its nonce. The local paddle stopped at371.52, while the contract continued to411 before the release arrived. Inspection of the actual production human relayer image verified that it already runs the dedicated50ms rules18 physics loop. The browser pilot was redundant. Commit `55c2c4071b3de087c1211d6abf8f748709f6a426` makes rules18 use that existing server owner and retains the legacy pilot for older rules. It does not change the contract, collision geometry or server cadence. The new regression fails before and passes after;76 focused tests, all1,255 TypeScript tests, root type checking and secret scan pass.

This corrects a demonstrated source of command queuing. It is not proof against arbitrary delivery stalls or a substitute for repeating the actual browser collision gates. Web69 is being built; web68 remains current until the guarded cutover succeeds.


## Web69 rollout

The queue correction was deployed on 9 October at 14:56:15 UTC from `55c2c4071b3de087c1211d6abf8f748709f6a426`, image `sha256:f0c58c6ffc486c8ff2251f36933b71f7611bdf37c6fddeba0be84ae97ae66b90`. The guard confirmed idle canonical block 69568623, hash `0x641f53f158f0459a4413060b2ef17f935d918053f0f54062c09529804e3c16c2`. Only the web service changed; all other roles resumed, with no match cancellation or delegation closure. Backup68 was still within its verified freshness bound. The immediate rollback is web68 (`e9aeaa2a...`), without restoring a database.

The bounded headed PvP76 driver is now running. Agent series76 and multiball76 are prepared and have not started. No new passing browser result or final qualification is claimed.


## Web69 browser results so far

PvP76 Classic passed naturally3-7. Both clients passed collision, held-speed and release gates; peer reception p95 was15.21ms against15.43ms send p95, local response p95 below16ms and maximum stop drift1.56 units.

PvP76 Chaos ended naturally7-6 with no painted paddle crossing, unconfirmed bounce or paddle jump. It nevertheless **failed**: both clients held a rally for about1.13s, and one showed a brief resynchronization. The neutral input's exact receipt reverted after its deadline by20 blocks. The server tick journal has a concurrent1.331s receipt gap. This establishes a common live delay, not its internal cause. Original reports/videos remain unchanged; no performance gate is waived.

The disconnected beneficiary's actual0.006MON payout is confirmed, with duplicate claim and retry rejected. See [the canonical payment verification](responsive-payment76-20261009.json). Normal agent series76 has now stopped on the failure described below. Prepared multiball77 was not run.

## Final observation at 15:32 UTC: partial correction, qualification remains failed

Web69 remains deployed. Six new natural agent games passed the complete browser gates, across Chrome desktop and Edge mobile emulation:1636,1637,1639,1644,1646,1647. All reported zero painted paddle crossings and unconfirmed bounces. Neither their success nor the replay below replaces the missing live multiball coverage.

Natural Chaos1641 had no pause, resynchronization, false bounce or paddle crossing, but **failed release drift**. A real edge contact required the displayed paddle to move6.439968 units after release, exceeding the unchanged six-unit maximum. The original press took30ms and the release11ms, with less than1ms local queuing. The displayed contact remains compatible with the authoritative collision, but this reconciliation tradeoff remains unresolved. See [the preserved trace](responsive-release1641-20261009.json). Do not hide this failure by increasing the threshold, moving the ball or claiming that all movement targets passed.

The bounded natural multiball diagnosis78 stopped after its fourth game,1649. The first three passed but did not draw multiball.1649 ended naturally0-7 with zero painted crossings; it failed because it required three protective resumes. A Windows heartbeat took1447ms while an independent VPS engine command to the same node took1259ms in the same interval. The observed maximum was13 pending slots, no send gate, and17 player commands/s. These observations do not establish the provider's internal cause, but cannot be explained by a render-only correction. Exact hashes and timings are in [the incident evidence](responsive-pause1649-20261009.json). No game driver remains active and no failing result has been relabelled as a pass.

The original1509 replay remains publicly retained. A separate **read-only** headed Chrome1440px and Edge390px check painted its recorded multiball sequence, verified both balls' positions against the actual snapshots and recorded the first miss/second return independently. The desktop replay court is1143.7px wide. Videos and captures remain in `artifacts/qualification/replay1509-web69-attempt2`; [the report](responsive-replay1509-browser-20261009.json) expressly excludes original client prediction, live qualification and physical mobile proof. The first attempt failed before browser launch because its harness guessed a nonexistent start snapshot; that report is preserved. The successful attempt selects an existing frame without changing any recording.

Backup69 was completed and its six files,352221584bytes, verified off VPS at15:30:00 UTC. Manifest SHA-256:`77f2b82272c834f2a01b9a22cac2bbd5d8da59de9f928af138ec01e94f0c8fdf`. The earlier successful five-database restoration remains the restoration proof; backup69 itself has not been restored. Immediate rollback remains web68 without a database restore. The final TypeScript check passes. There is no final unchanged24-hour trial or completed release claim; the scheduled automation remains disabled.
