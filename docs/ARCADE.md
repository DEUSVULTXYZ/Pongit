# PONGIT Arcade (GameV3)

Arcade adds two-hour gameplay authorizations, same-tab reload recovery, direct rematches, private invitation notifications and an original chiptune soundtrack. Classic/Chaos physics and financial rules remain unchanged. Monad Testnet only; daily sponsorship remains unlimited (`RELAYER_DAILY_BUDGET_MON=0`).

## Accounts and authorization

`web/lib/wallet.ts` remembers only the address, credential identifier and RP domain in localStorage. The wallet PRF derivation is unchanged. Continue selects that credential; Use another passkey performs discoverable selection; Forget removes the hint.

`web/lib/arcade.ts` stores the limited game key, signed grant and pending match consent/reveal data in sessionStorage. Wallet keys, notebook encryption keys and decrypted notes are excluded. The grant expires within two hours and is bound by EIP-712 to the registry, chain, player, key and GameV3. Registration requires signatures from both the wallet and game key, preventing another wallet from claiming somebody else's public input key. Renewal replaces the previous grant. Onchain revocation invalidates gameplay immediately; an offline logout clears local material and explicitly reports unconfirmed revocation.

GameV3 accepts a live arcade signer for bilateral match consent, restoring its own paddle authorization, revoking paddle control and conceding its own match. It enforces participant membership, rules, mode, ranked/friendly status, nonces and expiry. An arcade signer cannot delegate an unrelated input key. Vault, market, tournament payments and administration keep wallet-only authorization. Application authentication supports the registered game key for invitations and encrypted app data; it never grants a financial permission. A Web Lock permits only one controlling tab per account/deployment. Reload verifies the grant; expiration and revocation require explicit renewal and never trigger a surprise passkey dialog during play.

## Duels and audio

Rematch sends the previous opponent a 60-second invitation with source-derived rules. `POST /challenges/rematch` requires a versioned reference and verifies the caller participated in that finished match. Both players' signed joins still bind the exact opponent and rules. Tournament rematches use tournament ID zero and no entry fee. Other invitations last ten minutes and are friendly by default. Crossed/duplicate requests reuse the same active invitation. Accept automatically advances both players to consent, creation and reveal. Notifications require an authenticated WebSocket subscription; private events are sent only to the relevant accounts. Inbox polling and reconnect refresh provide recovery.

`web/lib/audio.ts` composes an original eight-bar minor-key chiptune loop, with separate effects for controls, invitations, matching, countdowns, impacts, points, handicap changes and results. A single AudioContext uses independent music/effects buses, voice limits and jingle ducking. The first entrance offers sound or mute (20% music, 60% effects). Preferences persist; subsequent visits resume after a permitted gesture. Scores/results use confirmed transitions. Reconnect snapshots do not replay a backlog of effects. Visibility changes suspend the audio scheduler and animations.

The background uses CSS perspective, transforms and opacity: cyan/violet grid, orbit outlines and moving particles around an opaque court. Background effects can be disabled; reduced-motion settings suppress animation. No realtime 3D engine is loaded.

## Contract deployment

Chain **10143**, index start block **60228868**. Deployment/binding receipts are in [the manifest](../deployments/testnet-v3.json).

| Contract | Address |
|---|---|
| GameV3 | `0x7b54521dfc6e8a4f310180fe2c232a4aab8582ad` |
| ArcadeSessions | `0xcbc74334ba69e7066535c2706ac686055f1ff426` |
| Vault | `0x405da4f0284b51a8a2b55ae93fbd7be7914d2e3e` |
| LMSR | `0x2a2e0abf17b0510f668aa1c03d7ea93333b98d8e` |
| Market | `0x61d0c59b376b482eb30b521bf696a54f33a4d567` |
| TournamentsV3 | `0x9ef9ee646786eabda1ea32b9b23f3c8b6dff0e01` |

V3 inherits both ELO ratings from V2. V1/V2 manifests remain recursively embedded and their balances, claims, withdrawals and replay references remain separate. A single relayer signing journal retains all previous raw transactions/nonces. Envio indexes all three generations into a new database; prior databases remain intact. The immutable treasury still requires redeployment to replace it.

## Validation

- [64 Solidity tests and 11 TypeScript tests](evidence/arcade/contracts-and-unit.txt), including invalid/replayed grants, key possession, expiry/revocation, multiple delegated matches and rejected owner-fund withdrawal.
- [10,000 differential cases per mode](evidence/arcade/differential.txt), zero mismatches.
- [Production-build browser flow on isolated Anvil](evidence/arcade/browser-local.json): direct duel, two-player rematch, spectator, F5 with no new PRF assertion, another controlling tab rejected, separate finance assertion, logout revocation and remembered reconnect.
- [Chaos and private notebook](evidence/arcade/chaos-local.json): bet-driven handicap, confirmed result, independent friendly ELO, encrypted save/recovery, timestamped replay notes and mobile layout.
- [Crash recovery V1 → V2 → V3](evidence/arcade/recovery.json): identical pending signed bytes/nonce after migration, one credit per generation and sequential subsequent nonce. [Four-player tournament](evidence/arcade/tournament-local.txt): three matches, two rounds and exact prize payout.
- [Chrome](evidence/arcade/audio-chromium.json), [Firefox](evidence/arcade/audio-firefox.json), [WebKit](evidence/arcade/audio-webkit.json): activation, mute, volume persistence, visibility lifecycle and reduced motion. Firefox/WebKit ran in Linux; Firefox used a PulseAudio null output. This verifies the audio graph and scheduling, not physical speaker quality or Safari/iOS hardware.
- Both npm audits report zero known vulnerabilities at validation time. Publication includes a separate tracked-file and Git-object secret scan.

Physical cross-device passkey synchronization and physical Safari/mobile speaker testing remain distinct device checks. Interlude is not integrated. Its browser demonstration reports about 30 ms; 50–150 ms remains a provisional PONGIT live-response target, dependent on the operator and network, not a measured guarantee or Monad settlement time. See [Interlude](https://interludelayer.xyz/) and [live versus settled reads](https://interludelayer.xyz/docs/read).

## Operations and Git

Use `ops/rollback-v3.sh COMMIT` only with a release containing identical V3/legacy manifests. It rejects V1/V2 application binaries and changes to immutable contracts. Backups enumerate every PONGIT indexer generation and retain the original relayer journal. The existing offsite SSH copy and seven-day retention remain in place. See [operations](DEPLOYMENT.md).

All twelve historical project commits were rewritten from T450 to DEUSVULTXYZ for both author and committer, preserving trees, timestamps and messages. The original bundle and old/new SHA mapping are private operator artifacts outside this repository. Publication uses explicit force-with-lease checks on main and codex/pongit-v2. GitHub caches and third-party clones may retain the old metadata.
