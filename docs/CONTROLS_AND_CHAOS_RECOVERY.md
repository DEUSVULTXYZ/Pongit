# Controls and Chaos publication recovery

This change keeps the deployed game and financial contracts unchanged.

## Findings

The Chaos keeper used a live engine pause to call `openRound` on Monad. That contract reads the published game copy, which may still be in the previous rally. Its `not a Chaos pause` revert is a contract check, not HTTP throttling. The keeper also wrote that financial error into the global game-service error, including viem's raw call details.

The input lane already serialized writes and retained one latest intention, but rapid key events could drain several writes immediately. A known HTTP cooldown was checked in the transport, after the SDK had reserved a nonce. A locally refused write could therefore trigger an unnecessary session restoration.

The browser regression also showed a one-second `Retry-After` becoming a ten-second wait: viem's HTTP error discarded the response headers and triggered our fallback. The transport now preserves the actual response header through its error cause.

## Changes

- Before opening a betting window, read the Monad snapshot at one block and match its match ID, active phase, Chaos mode, seed, scores, pause flag and serve boundary. Ordinary input revisions do not invalidate a pause. Wait if the required pause is not published.
- Reobserve explicit window-state preflight races. Keep unexpected failures in diagnostics, without replacing global game availability or exposing transaction calldata in the interface.
- Space movement submissions by at least 50 ms, retaining only the latest unsent direction. A 20 ms local pump drains that intention without increasing the idle RPC cadence. This is client pacing, not a claim about Interlude's quota.
- Check an existing node cooldown before invoking the SDK. No SDK nonce is reserved for a command held locally. Actual uncertain submissions continue through the persisted receipt-reconciliation path using the same signed bytes.
- Always process key release during synchronization. Previously the keyboard handler ignored `keyup` while controls were disabled, leaving an old direction held in its key set after receipt recovery. This was reproduced by the browser regression before correction.
- Use a separate `performance.now()` stopwatch for matchmaking, driven by its own browser interval. Server timestamps only distinguish queue entries. Reloading starts a fresh local stopwatch; it does not cancel the search. Shared match-start deadlines still use the shared clock.

## Recorded traffic

The two-hour production diagnostic sample inspected on September 12 contained two remote Interlude 429 responses, for `eth_call` and `interlude_sendTransaction`, received around 19:12 UTC, plus one locally blocked attempt. Recorded one-second maxima were 16 browser calls and 7 VPS calls, separately. Browser telemetry is sampled and can miss undelivered reports; these are not a complete capture or proof of the endpoint's effective quota. No 600 requests/s saturation was established by this evidence.

## Validation

Tests cover 100 rapid direction changes per player and mode, sequential nonces, latest release, cooldowns without SDK entry, read failures, uncertain submissions, published-pause identity, local queue timing and shared start timing. The isolated PostgreSQL finance fixture additionally exercises an unpublished pause, an older published rally, a preflight race, payment recovery and challenge logging. Browser tests use the real built frontend and SDK with simulated external API and chain responses; they distinguish a write rejected before execution from a lost response after execution.

The provider's actual Retry-After remains respected. A provider outage can delay commands; these changes do not promise uninterrupted confirmed movement when the node refuses requests.

### Results on September 12

- 161 TypeScript tests and type checking passed. The production Next.js build passed. No contract or dependency changed.
- [Browser evidence](evidence/controls/browser.json): real built frontend and SDK, simulated external responses, two players per mode at 1440 and 390 px. Each player issued 100 rapid key presses and releases. The scenarios produced 38 Classic and 37 Chaos movement writes including recovery checks, without a nonce gap. A rejected write and a response lost after execution both recovered without refresh or passkey. With an exposed one-second Retry-After, controls recovered in 1,181 and 1,151 ms, compared with approximately ten seconds before the transport correction. These are fixture recovery timings, not production game latency measurements.
- [Financial evidence](evidence/controls/finance.json): isolated PostgreSQL, unpublished and mismatched pauses wait; a confirmed preflight race recovers; no handicap is authorized while betting is still open; payment/restart/challenge checks pass.
- The reported match `43952628632842755105364335630961921449380810628858374772240326723558378200117` was read on both live Interlude and Monad at 20:01:59 UTC. Both returned revision 158, phase 3, score 7–4 and no serve pause. The rejected calldata decodes as `openRound`.
- The live node's ordinary response exposes headers with `Access-Control-Expose-Headers: *`. Browser fixtures explicitly expose Retry-After as well. If a throttling response does not expose that header, the conservative fallback remains necessary.

## Release and rollback

Runtime source: `c4f9095b855167814ca3328385e3fb152c66b179`. Browser fixture refinements and this report are recorded in the subsequent validation commit.

Backup `20260912T202100Z` was copied off the VPS and its database dump checksums verified. Contract manifests are unchanged byte for byte. The independent-home migration remains inactive.

- Web: `pongit-web:controls-c4f9095`, `sha256:7bdfa16e0c335e12ece51bdbf2ff46a9a4243cd4fd566d9ebe57cbea5257a383`.
- Relayer: `pongit-relayer:controls-c4f9095`, `sha256:bf3d03d14428cd2eadd69da681c4f7de591b254ac7e0a7ea3eb53eaf2ca98dbc`.

Rollback restores `/opt/pongit/current` to `/opt/pongit/releases/b8f72f9f08874311d60208e4b3c9f57401878e39`, then runs `docker compose up -d --no-build --no-deps relayer web` from that directory. Preserve the live databases, operation journal and financial manifests. The previous countdown images and older recovery8/recovery7 rollback images are retained.

Deployed at **2026-09-12 20:27:40 UTC**. Public home and the updated rooms guide returned HTTP 200. Health reported game online, admissions open, healthy epoch 2 and no payment-worker error. Three transient 502 responses during web replacement were followed by successful checks. Post-deployment checks were read-only; no new real multiplayer or financial transaction was initiated for this patch. Temporary test containers and their private network were removed. Verified unused PONGIT build caches were cleaned while retaining production, rollback images, volumes and other projects; disk usage finished at 79%.
