# Controls and Chaos publication recovery

This change keeps the deployed game and financial contracts unchanged.

## Findings

The Chaos keeper used a live engine pause to call `openRound` on Monad. That contract reads the published game copy, which may still be in the previous rally. Its `not a Chaos pause` revert is a contract check, not HTTP throttling. The keeper also wrote that financial error into the global game-service error, including viem's raw call details.

The input lane already serialized writes and retained one latest intention, but rapid key events could drain several writes immediately. A known HTTP cooldown was checked in the transport, after the SDK had reserved a nonce. A locally refused write could therefore trigger an unnecessary session restoration.

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
