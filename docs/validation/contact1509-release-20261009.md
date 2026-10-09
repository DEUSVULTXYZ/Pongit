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
