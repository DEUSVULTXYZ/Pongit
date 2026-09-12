# Matchmaking clock and match introduction

Follow-up: the older-tab bypass described below was removed in the [acceptance correction](COUNTDOWN_ACCEPTANCE_FIX.md). The queue stopwatch also now uses browser monotonic time independently of the service clock, as described in [control recovery](CONTROLS_AND_CHAOS_RECOVERY.md).

Deployed on 12 September 2026 at 19:40:46 UTC from `b8f72f9f08874311d60208e4b3c9f57401878e39`.

## Changes

The previous queue display subtracted a VPS timestamp from the browser's wall clock. The inspected PC was approximately 28 seconds behind the VPS, leaving the nonnegative timer at zero until it caught up. Rooms responses now include server time; a monotonic browser clock advances the display. The queue also has a progressing fallback for older responses. This display clock does not change engine timestamps, signature validity or physical rules. The independent candidate uses the same display-clock fix against its pinned Monad timestamp.

On the public rooms path, clicking Accept records readiness separately from engine consent. Two ready players create one persisted three-second introduction deadline. The court displays expanding, fading 3, 2, 1 numerals. Reduced motion shows stationary numerals. Updated clients wait until the deadline before submitting their engine acceptances, and the contract still requires both signatures. A slow confirmation shows a waiting state. F5 and duplicate readiness requests do not reset the deadline. Older already-open tabs can still send their first agreement; the updated peer delays the second one. This is an introduction to admission, not a pause retrofitted into the immutable physics contract. The independent candidate's admission architecture was not activated by this release.

Chaos still pauses after each nonfinal point for published bets and a new paddle-height checkpoint. The existing 40-block betting window and two-block closing guard are unchanged. The public court now explains `Synchronizing Chaos bets`, including the need for confirmed Monad bets, instead of only saying `Preparing next rally`. The three-second introduction is separate from this financial intermission.

## Validation

- TypeScript compilation and the production Next.js build passed; 156 TypeScript tests passed. No Solidity code or dependency changed.
- [Coordinator regression](evidence/countdown/coordinator.json): real isolated PostgreSQL with a simulated engine, 20 duplicate queue/cancel cycles, eight-member capacity, one persisted countdown, early acceptance refusal, slow RPC outside the lobby lock, expiry and recovery.
- [Two-browser validation](evidence/countdown/browser.json): actual production image with simulated API/chain responses, Classic and Chaos, 1440 px and 390 px, a 28-second clock mismatch, both approvals, F5 before launch, 3/2/1, reduced motion and no horizontal overflow or page errors. Engine acceptance dispatch occurred 3.207 to 3.400 seconds after the second ready signal. These are fixture timings, not measurements of Interlude inclusion latency.
- [Mobile introduction](evidence/countdown/classic-intro.png). No passkey credential, private key, raw transaction or user account was saved in these reports.

Public home, updated docs and health checks passed after deployment. The service reported the same application `0xfd1693294fed77304662f08e827b043b0ba386a3`, epoch 2, healthy with admissions open. Three transient 502 responses occurred while the web container was replaced, then the retry succeeded. No real user match or financial operation was initiated for this UI check.

## Deployment and rollback

The database/configuration backup `20260912T193255Z` was copied off the VPS and its dump checksums verified. Only web and relayer were replaced. Contract manifests were compared byte for byte; databases, financial journals and independent-home activation were unchanged. Build-only PONGIT images were removed after identifying them in this build's log, and disk usage returned below 80%.

Images:

- `pongit-web:countdown-b8f72f9`, `sha256:610cbd7f429e456880cfdcdeee0dc69cd8b4398b2457b8a766d1d0131ac83067`.
- `pongit-relayer:countdown-b8f72f9`, `sha256:fdb927d7ca25298bdec7b630293cde074ca9e42f8dac0776553125a325c36c3e`.

Rollback restores the `current` symlink to `/opt/pongit/releases/8092800ed918795315de6edcf54a5ac6dfc66b1e`, then runs `docker compose up -d --no-build --no-deps relayer web` from that directory. Its web recovery8 and relayer recovery7 images remain available. Preserve the operation journal and the additive readiness fields; do not restore an older database or discard uncertain engine transactions.
