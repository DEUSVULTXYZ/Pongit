# Match 1509: contact rendering and frame timing

The production web image was updated on 9 October 2026 at 13:46:14 UTC from commit `5b9e6e43d718e62d39340dcbb4289be97efcc60b`. This includes the earlier contact correction in `2499ce1`. Contracts, the engine, command ownership and delegation were unchanged.

## Evidence and causes

Match 1509 finished 7–6 with no contractual pause. Its retained replay contains 695 frames, including a simultaneous multiball sequence. The Solidity/TypeScript reconstruction agrees on the two balls: one misses and the other hits. The original user's predicted browser picture is not in the replay, so this alone does not disprove the reported visual crossing.

Actual headed browser tests subsequently reproduced a painted ball crossing a painted paddle in match 1529. The ball was waiting at an unresolved contact while the paddle picture continued on a different timeline. Follow-up tests exposed corrections that snapped a paddle to an unnecessarily exact contact position. The renderer now constrains each incoming ball independently and keeps the nearest paddle position compatible with the authoritative hit, miss or split-paddle segment. It does not move the ball to invent a hit. Both simultaneous balls constrain the same displayed paddle consistently.

The stronger actual-paint timing check then detected another real defect in match 1597: the remote paddle advanced 15.03 units between canvas paints only 0.4 ms apart. The RAF callback timestamps advanced 50 ms while execution was delayed. Local input and remote prediction used different clocks. The complete court now samples `performance.now()` once at draw entry, including immediate input paints. The ball and both paddles share that actual frame time. See [the recorded trace](responsive-render1597-20261009.json) and the [browser timestamp semantics](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#parameters).

## Validation status

The candidate passed 1,250 TypeScript tests, root type checking, the Linux web build and the secret scan. The new headed production series starts with the Classic scenario that reproduced match 1597, followed by five Chaos games and another Classic game. PvP and additional naturally drawn multiball coverage are separate gates. These are ongoing; unit tests and a successful deployment are not end-to-end qualification.

All previous failed reports, videos and traces remain intact. Earlier series 70 results must not be presented as complete validation: the stronger paint-time check found a previously hidden remote jump in match 1585. The isolated observer-delay failure in match 1576 remains unresolved and was not reproduced by the independent read-only wire probe. No final 24-hour qualification has started.

## Deployment and recovery

The new image is `sha256:ec309447cf7503fdbc020e4b0c2f0c2f7925c849ca04f645a15e4d7cc4a4a2c5`. The guarded deployment waited for natural match completion and verified an idle canonical state at block 69554762 before changing the web image. All services resumed. No match was cancelled and no delegation was closed.

Backup `backup-entry-66` contains five databases and the runtime configuration: 340,222,333 bytes, verified off VPS at 13:44:04 UTC. Its manifest SHA-256 is `6fc1c245ecbffea165f762d55748719726d286c33c6bb529a829c0c87b8e3867`. The earlier successful five-database restoration evidence is retained.

The immediate service rollback is web65, image `sha256:a77553468d9ccd77922be179a4f8cce3683071d311866d2fca89aabcaf7da8cc`. Revert only the web image in the canonical Compose file and its recorded mirror, after an idle boundary. Do not restore an old database or erase subsequent results and journals. That rollback retains the known old frame-timing limitation.

The scheduled automation remains disabled. Browser passkeys and mobile interactions in these tests are virtual/emulated, not physical-device evidence.
