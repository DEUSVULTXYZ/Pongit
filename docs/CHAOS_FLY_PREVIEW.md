# Public Chaos testnet preview

On 9 September 2026, the owner explicitly requested a public cutover despite the reproducible hosted RPC rate limit. The active manifest selects `0xfd1693294fed77304662f08e827b043b0ba386a3` at `https://il-fd1693294fed7730.fly.dev`, rules 4, engine epoch 1. This authorizes a playable preview; it does not mark unfinished acceptance tests as passed.

## Available and preserved

Classic and Chaos have separate matchmaking and rankings. Friendly invitations and eight-member rooms retain their consent flow. Spectator bets use the new app's sealed adapter, market and vault from `deployments/rooms-finance.json`. Mera wallet addresses stay unchanged, but the new app needs a fresh game-session grant. Existing V4 and earlier financial rights remain separate.

The read-only cutover check passed: both engines are empty, no changes await publication, the live epoch matches Monad, and the Classic base pin includes its last commit. Nine existing account ratings match exactly, including a non-default rating of 986 after two games. Financial destinations and nonce journals must be preserved during deployment and rollback. Diagnostic bettors and their pending entitlements remain recoverable.

## Known limitations

- The 13:39 UTC retest received 59 successful reads in about eight seconds, followed by HTTP 429 and `Retry-After: 10`. Six low-frequency reads later succeeded. Pauses remain possible. Read coalescing and cooldown handling reduce duplicate traffic without changing accepted transactions.
- Real bets and a 72-unit paddle handicap were observed on this app, and terminal results were published. Its full payout and close/renew cycle has not been completed. The automatic lifecycle retains the actual one-hour challenge period; no early payout bypass is enabled.
- Earlier candidate payouts and browser checks are historical evidence, not validation of this Fly release. The 100-input trial failed on a read quota; full multiplayer/load acceptance is incomplete.

The runtime keeps sponsoring without a daily cap and uses test MON only. No new hosted app, financial contract or rating reset is required for this preview.

## Rollback

Keep the previous images and a private pre-cutover backup. Use `bash ops/rollback-rooms.sh` from the active release to close new room admissions and return the homepage to V4 while retaining the rooms-compatible relayer, financial manifests and journals. Do not restore an older database or change a binding under pending transactions. Returning to the expired Railway Classic app is not a working fallback.
