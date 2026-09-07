# Interlude Classic lab

The active manifest is `deployments/interlude-lab.json`. Rules 3 add uncapped
per-return acceleration and automatic arcade results to the dedicated lab.
The main V4 arcade, rankings, Chaos, tournaments, markets, payments and replay
data retain their existing behavior.

## Current deployment

| Field | Value |
| --- | --- |
| Rules | 3, Classic friendly, first to seven |
| Game | `0xbe51fea690699ad07e4eb5932c4d131689072999` |
| Dedicated engine | `https://il-be51fea690699ad0-production.up.railway.app` |
| Hub | `0xDf840A85DB56430970b32f0e3210cabB5CD1F270` |
| Base / engine chain | 10143 / 4242 |
| Virtual tick | 10 ms |
| Delegation block | 60585234 |
| Runtime hash | `0xf9c9aaf511164162f2259be15173196fddc0af9c6c5a62cbe2b432dcbf17690f` |
| Initial delegation expiry | 2026-09-08T21:53:52+00:00 |

Interlude operates the shipped app and owns its immutable contract. SDK 0.1.1
and CLI 0.1.3 remain pinned. Prior manifests are preserved as
`deployments/interlude-lab-rules1.json` and `deployments/interlude-lab-rules2.json`.
Lab match references include the app address. This new contract requires one
explicit Mera grant; previous grants name their original app.

Do not use `ship` to renew or restart a deployment: it creates another app.
Initial delegation lasts 24 hours and renewal requires the hosted operator.

## Rally acceleration

Ball velocity starts at 192 horizontal and 96 vertical logical units per second.
Every successful paddle return increases its magnitude by 10%, with integer
rounding identical in Solidity and TypeScript. There is no gameplay speed cap.
Walls and misses do not accelerate it. Each non-final point resets the next
serve to the initial velocity before catch-up continues. Paddle speed stays
180, paddle height 96 and the court 1024 by 576. V1-V4 physics is unchanged.

`PhysicsInterlude` wraps the existing Classic collision engine and
`shared/physics-interlude.ts` mirrors it using bigint. Per-call collision work
remains bounded and resumable. The live renderer uses those same accelerating
paddle and wall trajectories but never predicts a score, serve or winner.
The owner paddle and monotone presentation clock retain their previous fixes.

## Seventh point and result screen

The previous lab contract already finished naturally at seven. Its page showed
only an inline result below the court, so it appeared not to finish. The lab now
uses the arcade's accessible VICTORY / DEFEAT overlay after observing an engine
transition from active to complete. Spectators see a neutral winner announcement.
The overlay identifies Interlude confirmation separately from Monad commitment.

Animations last four seconds and can be skipped immediately. The page behind
is locked, the result can scroll, and focus moves to its actions. Opening an
already completed match or reloading does not replay the celebration. View
result opens a static result. Rematch targets the previous rival, who accepts
with Accept & play; Create open invitation creates an untargeted invitation.
There is no lab replay, ranked result, prize or financial settlement.

A final input or tick can race the other player's decisive point. The lane
re-reads the same arena after a rejected call: a verified terminal state ends
input cleanly without invalidating the session. An uncertain active-state write
still freezes and requires explicit recovery; signed actions are not retried.

## Permissions and lifecycle

The arena supports targeted or open ten-minute invitations, two participants,
public spectators, keyboard/touch movement, concession and bounded public ticks.
There are no ELO, vault, market, tournament or payment methods in this app.
Game writes are engine-only with participant checks, sequential input nonces
and short deadlines. The 23 scalar slots and result-hash mapping are unchanged.
The vendored Solidity and generated delegation surface are unchanged.

Mera signs a separate 30-minute scoped SDK grant. The wallet key closes after
signing; the game key and grant stay in session storage. F5 restores the grant;
a Web Lock permits one controlling tab per app/account. Disconnect removes the
local key, without revoking other copies. Hub epoch revocation must be observed
by the pinned engine. The page checks active delegation, epoch, expiry and clock.

`readSettled` reads the last committed Monad state. A matching result hash does
not prove that the optimistic challenge window has closed. No lab result can
settle markets or pay prizes. See [Interlude's read model](https://interludelayer.xyz/docs/read).

## Validation and reproduction

Run `forge test --root contracts`, the relevant `tests/interlude-*.test.ts` files,
`tsc --noEmit` and a production build. `scripts/differential-interlude.ts` runs
10,000 rules-3 comparisons in an isolated VPS Anvil container. It includes up
to 40 accumulated returns, exact boundaries, small budgets and long delays.

`npm run interlude:probe -- inspect` checks full engine and Monad runtime, Hub,
CORS and block cadence. The play probe and `scripts/interlude-browser.mjs`
create test games and only run in an empty lab. Browser validation uses the
real Mera and Interlude SDKs with Chromium virtual PRF authenticators. It does
not substitute for physical-device passkey testing.

Validated: 97 Solidity tests, 17 relevant TypeScript tests, type checking, the
production build and all 10,000 physics comparisons. Two virtual-PRF players
completed a natural 4:7 match; both result overlays, spectator announcement,
F5, static reopening and targeted rematch passed. Deliberately delayed contact
snapshots produced no frozen paddle-contact frames at 390 and 1440 px.
See [the machine-readable validation record](INTERLUDE_RULES3_VALIDATION.json).

## Release and rollback

Before switching, verify the previous arena has no active invitation or game.
Back up production and preserve the previous web image and release path. Replace
only the web service; V4 services remain running. Existing pages keep their old
lab until refreshed. Approve a new scoped session explicitly on the new app.

For rollback, drain the current lab, restore the previous web image and release
symlink, then recreate only web. The rules-3 contract and results stay on Monad.
Verify the preceding delegation is still active before advertising it as playable.

Historical validation: [rules 1](INTERLUDE_LAB_RULES1.md),
[rules 2](INTERLUDE_LAB_RULES2.md).
