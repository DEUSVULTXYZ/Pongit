# Pixel Palace public testnet cutover

On 8 September 2026, the owner requested production activation of the approved B direction. The initial application artifact is commit `de302a4a54c06df606f95dab95828ab567b62bab`. The release follow-up changes documentation only to reflect the public launch and its remaining operator dependency.

## Deployed behavior

The homepage exposes Matchmaking, Invite someone and Create room, with the Pixel Palace artwork and arena surfaces. The coordinator runs alongside the existing V4 relayer on the VPS, using the production PostgreSQL database and additive `il_*` tables. Private test coordinators are stopped so that the admission account has a single transaction owner. Game inputs use the dedicated Interlude engine.

The V4 game manifest is unchanged. `/legacy`, old match URLs, documentation, financial journals and payout workers remain available. There is no migration of wallet balances, V4 markets or legacy ELO into rooms.

## Direct public validation

- HTTPS responses for `/`, `/rooms`, `/docs`, `/legacy`, `/api/health` and `/api/interlude/config` returned 200. The coordinator reported `online: true`, `admission: true` and no error. V4 health and payout discovery/worker status were healthy.
- Browser layout checks passed at 360 x 640, 390 x 844, 768 x 1024, 1440 x 1000 and 844 x 390. All three mobile actions fit above the fold; icons were centered, images loaded, the room background stayed static, and reduced-motion/focus behavior passed. Legacy and docs smoke checks passed.
- Three fresh virtual-PRF accounts completed one friendly room through the real public HTTPS and WebSocket endpoints. Checks covered double participant consent, spectator entry, rectangular court, scoreboard separation, keyboard release, F5 session reuse, result dialogs and room rotation. All three accounts explicitly left afterward. No public usernames were reserved, no ranked result was created and no financial transaction was submitted.
- The browser runs reported no application exceptions or failed requests. The multiplayer check ran from 09:18:08 to 09:18:40 UTC. Reports and screenshots are retained privately under `artifacts/pixel-palace-production`.

These are Chromium tests with virtual authenticators, not physical passkey or cross-browser validation. This cutover does not claim a new latency benchmark, new contract tests or a fresh financial end-to-end test; candidate verification is recorded separately.

## Backup and rollback

A complete private database/configuration backup was made at 09:13:13 UTC, before schema activation, and copied off the VPS with checksums verified. Previous production images are retained as `pongit-web:before-pixel-palace` and `pongit-relayer:before-pixel-palace`. The previous release is `ad14eb6643f63c3493d9ed4c653342e75976fb5d`.

The authenticated operator rollback script is `/opt/pongit/shared/palace-production-rollback.sh`. It closes admission, restores the previous homepage image and retains the new coordinator for any existing rooms. It preserves all database tables and transaction journals. Never restore an older database backup over newer results or payments merely to revert the presentation.

## Operator availability

The preflight hub read reported active epoch 1, 109 published batches, no pending diffs and an expiry of **8 September 2026 at 22:56:08 UTC**. Same-application renewal has not been validated. The owner requested the public testnet launch with this limitation; it is not evidence of continuous operator service. Admission checks the hub session and epoch and closes when the delegation is invalid, near expiry or unavailable. The public manifest's `releaseReady: false` continues to flag this outstanding external verification.
