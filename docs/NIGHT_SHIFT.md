# Night Shift UX release

PONGIT now opens as a cabinet, with Play now as the primary action. The original Enter arcade / Enter muted choice is retained once per browser. Classic ranked remains the default; Chaos and direct challenges remain available.

## Interaction changes

- The first Play now click survives passkey creation or restoration and continues into matchmaking. Cancelling the connection drops the pending play intent. Renewing an expired arcade session also continues into matchmaking.
- Matchmaking and rematch waiting have their own display. Submitted matches retain their real cancellation limits.
- The home screen contains no inactive market, diagnostics, canvas or match feed. More contains Ladder, Tournaments and Replays. Balances, payments and legacy vaults are in Account.
- Dialogs share scroll locking, focus containment, focus restoration and Escape handling. Paddle shortcuts only intercept keys in a controllable match. Opening an overlay clears held inputs.
- A bet preview shows the selected side, estimated cost, maximum signed spend and potential payout before the owner passkey is requested. Changes beyond the shown maximum require another review.
- `GET /player/:address/recent-matches` reads the Envio RecentReplays entity and returns up to three versioned Match summaries across all supported deployments. The retention policy, stored balances and financial rights are unchanged.

## Presentation and music

The room is static CSS scenery with cabinet silhouettes, a lit marquee and a glass bezel. No continuous background animation or 3D runtime is used. Match results retain their four-second choreography and immediate skip, with reduced-motion support.

Last Stop is played through one HTML media element connected to the shared Web Audio mixer. Music defaults to 20%, effects to 60%, with saved settings preserved. The complete track loops naturally; music ducks during gameplay and jingles and pauses in hidden tabs. See `web/public/audio/CREDITS.md` for credit and usage terms.

## Operations

This is a UI and read-only API release. It does not redeploy contracts, migrate balances, change replay retention or activate Interlude. Test services run in an isolated VPS Compose project. Deploy the matching web and relayer images together; the API addition is compatible with older clients. Roll back both images to the previous release without reverting database data.

## Validation

- TypeScript type checking, all 22 TypeScript unit tests, all 77 contract tests and 20,000 Solidity/TypeScript physics comparisons (10,000 per mode) pass.
- Five responsive browser checks cover 360×640, 390×844, 768×1024, 1440×900 and 844×390. The primary action is visible at 360×640, home contains no inactive court/market, dialogs contain focus and lock scrolling, arrows remain available outside gameplay, and room animations are absent, including with reduced motion.
- Real Mera SDK with virtual CTAP2 PRF: first connection continues into one search; cancelling drops that intent; double clicking does not duplicate the queue; expired sessions renew from Play now. Direct duels, F5, duplicate-tab control, offline reconnect, crossed rematches, signed test credit and onchain revocation pass.
- V4 browser payment test: two winning bettors receive exact wallet transfers, a losing position shows no payout, an offline beneficiary receives automatically, commands continue during another match's settlement, and payment retries deduplicate.
- Chaos browser test: optional profile, encrypted notebook save/recovery, no plaintext in browser storage, targeted friendly match, paid-bet handicap, result, automatic payout, signed withdrawal and replay notes pass.
- Last Stop plays through all 214.6 seconds before naturally looping; a real-time test samples the whole track. Navigation preserves one media element/context. Music and effects produce measurable output; mute, hidden-tab suspension, volumes and Test sound pass.
- `npm audit --omit=dev`: zero reported vulnerabilities on 2026-09-07. Publication includes a separate redacted Git secret scan.

Test services are disposable on the VPS. Browser fixtures use their isolated chain, database and accounts, not the production wallet. Virtual WebAuthn verifies the Mera integration but does not prove synchronization between physical authenticators. Browser output measurements do not prove audibility through a particular speaker/headphone device.

### Before and after

The before captures are from the public site during the UX audit; the after captures are from the isolated release candidate. The network label therefore differs.

| | Before | After |
| --- | --- | --- |
| Desktop | [Previous home](images/home-before-desktop.png) | [Cabinet home](images/home-after-desktop.png) |
| Mobile | [Previous home](images/home-before-mobile.png) | [Cabinet home](images/home-after-mobile.png) |

### Bugs found during verification

The former generic `/player/` handler intercepted the new recent-match route; it now matches only a complete account path. A stale result banner could dereference a cleared match when a spectator started searching; result rendering and its focus lock are now tied to the original account and match reference. Tournament Play round now queues the correct bracket directly; its view refreshes while visible so other participants see registration and round changes without reloading. Bet review is bound to the account, game, match, side and amount, and refreshes its state version after the passkey ceremony without increasing the reviewed spending limit.

### Rollback

Before activation, preserve the running images as `pongit-web:cabinet-previous` and `pongit-relayer:cabinet-previous`, record the previous release directory, and run `ops/backup.sh`. The previous release for this rollout is `65397c42a26fc82b8f10e9f715fe9eb098819428`.

To return to it, point `/opt/pongit/current` to `/opt/pongit/releases/65397c42a26fc82b8f10e9f715fe9eb098819428`, tag the saved images back to `pongit-web:latest` and `pongit-relayer:latest`, then run `docker compose up -d --no-deps web relayer` from that directory. Check `/api/health` and the public home. Do not restore or delete live database data: no schema/retention migration belongs to this release. Existing payment jobs and replay rights remain in their original stores.
