# Interlude Classic lab

The active manifest is `deployments/interlude-lab.json`. Rules 2 introduce a
50% faster ball and continuous owner-paddle presentation. The main V4 arcade,
rankings, Chaos, tournaments, markets, payments and replay data are unchanged.

## Current deployment

| Field | Value |
| --- | --- |
| Rules | 2, Classic friendly, first to seven |
| Game | `0xdf912629b75afa67d5b0de0fe0c30cc063070e84` |
| Dedicated engine | `https://il-df912629b75afa67-production.up.railway.app` |
| Hub | `0xDf840A85DB56430970b32f0e3210cabB5CD1F270` |
| Base / engine chain | 10143 / 4242 |
| Delegation block | 60574281 |
| Runtime hash | `0xf9cd65fa752a28a3fed8ff6de4816bd16790eefa8e7b64bcea20cf8d59114931` |
| Initial delegation expiry | 8 September 2026, 20:58:42 UTC |

Interlude owns and operates the shipped app. One deliberate rules-2 deployment
request returned HTTP 200 on 7 September 2026 at 20:58:31 UTC. The new node's
runtime matches the compiled artifact on both the engine and Monad. A ten-second
sample measured 99.47 engine blocks per second. The virtual clock remains 10 ms
per block. SDK 0.1.1 and CLI 0.1.3 remain pinned.

The prior app is preserved in `deployments/interlude-lab-rules1.json`; its original
validation is in [the rules-1 record](INTERLUDE_LAB_RULES1.md). References to lab
matches must include their app address. No balances need migration. The new app
requires an explicit new Mera grant, because old signatures name the old app.
Do not use `ship` to renew or restart either deployment: it creates another app.
Initial delegation lasts 24 hours and renewal requires the hosted operator.

## Motion and physics

`PhysicsInterlude` composes the unchanged Classic collision library with a new
serve speed. Ball velocity components are 192 horizontal and 96 vertical logical
units per second, compared with 128 and 64 previously. Every non-final point
applies the same multiplier before another rally is simulated, including bounded
catch-up. Paddle speed stays 180, paddle height 96 and the court 1024 by 576.
`shared/physics-interlude.ts` mirrors the rules with bigint arithmetic. V1-V4
continue to use their existing physics.

The lab's owner paddle advances immediately from its displayed position.
Acknowledgements reconcile gradually only after the relevant direction is
confirmed. Corrections cannot reverse a held direction. Preview remains bounded
and stops extending when snapshots are stale. The presentation clock cannot
rewind when two RPC responses arrive with different network delays. Duplicate
snapshots do not refresh their observation age. Neither presentation helper
changes contract collisions or results.

The single input writer drains the latest unsent release or reversal immediately
after its predecessor, without waiting for the next 100 ms maintenance interval.
Uncertain calls still freeze the lane rather than retrying signed transactions.
The four-call drain bound prevents continual input from monopolizing the loop.

## Permissions and lifecycle

The arena supports targeted or open ten-minute invitations, two participants,
public spectators, keyboard/touch movement, concession and bounded public ticks.
There are no ELO, vault, market, tournament or payment methods in this app.
Game writes are engine-only, with participant checks, ordered nonces and short
input deadlines. The same 23 scalar slots and result-hash mapping are delegated.
The vendored CLI Solidity and generated storage surface are unchanged.

Mera signs a separate 30-minute scoped SDK grant. The wallet key is closed after
signing; the game key and grant remain in session storage. F5 restores the grant,
and a Web Lock allows only one controlling tab per app/account. Disconnect
removes the local key; it does not revoke copies of an unexpired grant. Hub epoch
revocation must be observed by the pinned engine before it takes effect there.
The page checks active Hub delegation, epoch, expiry and engine clock regularly.
A lost or uncertain write requires explicit recovery with a refreshed SDK nonce.

`readSettled` reads the last state committed to Monad. A matching result hash is
not proof that the optimistic challenge window has closed. Never settle markets
or pay prizes using this experimental result. See [Interlude's read model](https://interludelayer.xyz/docs/read).

## Validation and reproduction

- 95 Solidity tests passed, including the three new speed/catch-up checks and
  unchanged V4 solvency, signature and payout suites.
- 10,000 new rules-2 Solidity/TypeScript comparisons passed with zero differences
  in an isolated, network-disabled VPS Anvil container. Cases include exact
  collision boundaries, zero/small catch-up budgets and long delays.
- Owner-presentation tests cover both directions, jittered snapshots, reversal,
  release, stale data, preview bounds and a non-reversing clock.
- The hosted probe submitted 200 directions: SDK p50 27.51 ms, p95 35.36 ms,
  p99 44.44 ms. Match 1's result hash was observed on Monad 2.104 seconds after
  its engine result. This is a sample, not a latency or finality guarantee.

Run `forge test --root contracts`, the relevant `tests/interlude-*.test.ts` files,
`tsc --noEmit` and a production build. Run `scripts/differential-interlude.ts` only
in the isolated VPS test environment; it starts its own private Anvil chain.
`npm run interlude:probe -- inspect` verifies the compiled runtime and node.
The `play` probe and `scripts/interlude-browser.mjs` create test games and must
only run in an empty lab. Browser checks use real Mera/Interlude SDKs with a
Chromium virtual PRF authenticator, not a second physical passkey device.
The motion probe samples actual canvas positions for both players across held
keys and reversals. Its hooks exist only in Playwright, not the shipped bundle.

## Release and rollback

Before switching, verify the rules-1 arena has no active invitation or game.
Back up production, preserve the preceding web image and release path, then
replace only the web service. Existing V4 contracts and services remain running.
A browser with the old page loaded can refresh to obtain the new lab and approve
its explicit new session. Do not interrupt active games on either deployment.

For rollback, drain the current lab, restore the saved web image and previous
release symlink, and recreate only the web container. This returns the page to
rules 1; the rules-2 contract and its historical results remain on Monad. Verify
that the old delegation is still active before advertising it as playable.
