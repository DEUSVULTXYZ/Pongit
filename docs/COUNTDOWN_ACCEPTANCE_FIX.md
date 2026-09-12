# Enforce the match introduction

Deployed 12 September 2026 at 21:56:49 UTC from `9ea903c61cd0f01786a39eb867908ba52ed0ad67`.

## Cause and correction

Production records for the 21:35 UTC Chaos match contained two successful acceptance preflights and their receipt acknowledgements, without any launch readiness state. The compatibility path for older open tabs still allowed direct engine agreements. Both old tabs could therefore start the match immediately, even though the updated frontend had a countdown.

Every new acceptance preflight now requires the updated client protocol, readiness from both actual participants, and the elapsed shared three-second deadline. A missing introduction no longer passes. Existing receipt reconciliation remains compatible and never treats an absent receipt as a failed transaction. Older tabs receive an explicit refresh instruction. A frontend retry before readiness has completed returns to the preparation step.

This is an admission gate in the frontend and API. The immutable game contract still starts when both engine agreements have executed; this release does not introduce a new onchain start-time rule. A refresh during an already active match resumes that match rather than restarting the introduction.

## Validation

- 161 TypeScript tests, type checking and the production Next.js build passed. A scheduler test previously relied on queue setup finishing in less than ten milliseconds; it now uses a controlled clock, retaining the same priority and rate assertions.
- [Coordinator regression](evidence/intro-acceptance/coordinator.json): real isolated PostgreSQL and HTTP routes with simulated RPC, including old-client refusal, missing-readiness refusal, duplicate acceptance protection, 20 queue cycles and recovery.
- [Browser regression](evidence/intro-acceptance/browser.json): Classic and Chaos at 1440 and 390 pixels, both acceptances, F5, reduced motion, local queue timing and injected 429 responses. Simulated engine sends began 3.201 to 3.410 seconds after both players were ready. These are fixture timings, not Interlude inclusion latency.
- [Real hosted-node check](evidence/intro-acceptance/live.json): two disposable, unfunded friendly players per mode used the candidate frontend with the production HTTPS coordinator and real Interlude. Both browsers recorded 3, 2 and 1 in both Classic and Chaos, then the engine reported active matches. Both test matches were conceded and the test players left their rooms. No bets or user financial signatures were made. This check covers match introduction, not a complete Chaos betting cycle.
- [Post-deployment API check](evidence/intro-acceptance/public-guard.json): production rejects both an old acceptance preflight and a new preflight with missing readiness. The disposable invitation was removed without an engine transaction.

## Chaos remains a separate change

The current Chaos contract still waits at nonfinal points for the published pause, a 40-block Monad betting window, two closing confirmation blocks and the signed pressure checkpoint. That financial dependency explains the inter-rally waiting state; it is unrelated to the match introduction. This release does not remove or hide it.

Matching Classic's rally timing requires changing the contract/market workflow. The proposed behavior is to process betting independently and apply the latest confirmed paid totals only at a point boundary. A late update would keep the existing paddle sizes until a later point, without freezing the ball. The alternative offered is to close bets before the match. This behavior has not been selected or deployed by this release; existing market rights remain unchanged.

## Deployment and rollback

Backup `20260912T215138Z` was copied off the VPS and checked before deployment. Contract manifests were compared byte for byte, and no database migration or financial rule changed. The current shared app remains `0xfd1693294fed77304662f08e827b043b0ba386a3`; independent-home activation remains disabled.

Only web and relayer were replaced, with images `pongit-web:intro-9ea903c` and `pongit-relayer:intro-9ea903c`. Three temporary 502 responses occurred during replacement; retries and the final public health check succeeded. Admissions and payment workers reported healthy afterward. Verified unused PONGIT build caches were removed and disk use returned to 78%; production, rollback images, volumes and other projects were preserved.

To roll back, restore the `current` symlink to `/opt/pongit/releases/c4f9095b855167814ca3328385e3fb152c66b179` and run `docker compose up -d --no-build --no-deps relayer web` from that release. Keep all journals and readiness fields. That rollback reinstates the older acceptance compatibility path, so the countdown bypass can reappear for old tabs.
