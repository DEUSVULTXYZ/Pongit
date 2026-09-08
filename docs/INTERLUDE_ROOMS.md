# Interlude rooms release candidate

This candidate is isolated from the V4 arcade and the previous single-arena lab. The public homepage must remain on its current deployment until the operator renewal and repository publishing gates below are satisfied.

## Deployment and trust boundaries

Public manifest: `deployments/interlude-rooms.json`. Base chain: Monad Testnet 10143. Dedicated engine: 4242, 10 ms virtual ticks. Capacity: two pending or active matches. Application: `0xb3f9c323ffb8ec6a8cd7d06ae239bc3d7bebd59a`. Admission signer: `0x6e0EbC79d80a186A639843C4059f421D634C3d73`.

The immutable contract stores per-match words in one delegated mapping. Namespaced keys include the runtime contract address, match ID and field. A reference must include the base chain, application and match ID. Room IDs are independent 32-byte identifiers. Old V4 URLs and the old lab keep their own deployment references.

An EIP-712 admission ticket commits to both participants, room, rules version, ranked flag, expiry and entropy. Each participant approves it through a limited Interlude grant. The coordinator cannot choose the winner, change physics, edit ELO or transfer money. Game commands go directly from the browser SDK to the dedicated engine. A public maintenance signer can only advance or expire existing games.

Each match reserves enough pending storage-diff capacity for creation and terminal rating writes before admission. With the current operator's 64-diff publication limit, the coordinator admits at most two matches and holds additional rooms in an explicit waiting state. A contract-level active counter also enforces two. Unit tests count unique slots touched by two simultaneous ranked finishes.

## HTTP and private notifications

Production URLs are prefixed with `/api/interlude`. All mutations require the expected `Origin`. Private calls require the HttpOnly `pongit_rooms` cookie and `X-Pongit-Player`, matching the authenticated account. No wallet key is sent to the server.

| Method and relative path | Purpose |
| --- | --- |
| `GET /config` | Public deployment, availability and admission status |
| `POST /auth/challenge` | One-use authentication nonce for a player |
| `POST /auth/session` | Verify the owner-signed scoped grant and session-key possession proof |
| `DELETE /auth/session` | Delete the coordinator cookie session |
| `GET /state` | Restore room, queue, proposals, private inbox and current ratings; refresh presence |
| `GET /contacts` | Private saved contacts and eight frequent rivals over thirty days |
| `POST /contacts/add`, `/contacts/remove` | Add or remove another account |
| `POST /profile` | Save the existing unique public username and avatar |
| `GET /ladder` | Live Interlude ELO and the separately read Monad copy |
| `POST /queue`, `/queue/cancel` | Join or cancel ranked matchmaking |
| `POST /rooms` | Create a group room with up to seven targeted invitations |
| `POST /invitations`, `/invitations/decline` | Create or decline a targeted friendly duel |
| `GET /rooms/:id` | Public minimal room-entry identity, kind and occupancy |
| `POST /rooms/join`, `/rooms/leave` | Join or leave, checking active participation on the engine |
| `POST /rooms/invite`, `/rooms/rejoin` | Invite another player or rejoin the queue |
| `POST /offers/accept`, `/offers/back` | Record consent intent or decline, after checking engine state |

Mutations other than authentication include an `operation` UUID. Repeating the same account, app and UUID returns the stored response. Reusing that UUID for a different body is rejected. Contract input nonces remain distinct from HTTP operation IDs.

Connect to `/ws` with the authenticated cookie, then send `{"type":"subscribe-rooms","player":"0x..."}`. The server verifies the account before subscribing. `rooms-changed` instructs the client to reload its private state; `rooms-expired` requires explicit session recovery. Other accounts' invitation bodies are never broadcast. Polling remains a fallback.

Typical failures are expired/revoked authentication (401), account mismatch (401), occupied player, full room, reserved invitation, expired offer, submitted acceptance and an active match requiring concession. Error messages are shown beside the relevant action.

## Persistence and recovery

PostgreSQL stores lobby state under a transaction-level advisory lock. A unique `(app, player)` occupancy table prevents queue/room double participation. Contacts, one-use auth challenges, hashed cookie tokens, idempotency results, signed admission offers, verified match summaries and exact signed maintenance transactions have separate tables. The admission key is supplied through `INTERLUDE_COORDINATOR_KEY`, outside Git.

The maintenance journal stores raw signed transaction bytes before broadcast. Recovery checks the same transaction receipt or resubmits the identical bytes. It never allocates another nonce to an uncertain transaction. A local cancellation does not invalidate an already-issued ticket: the coordinator keeps observing it until it expires before replacing it.

Result summaries are checked against the engine and separately against Monad. Published copies remain challengeable. The audit cycles over bounded historical batches. Invalidated results are removed from derived statistics; reappearing active matches restore participation from their engine snapshot. A delegation mismatch hides unverified derived results and closes admission. Actual operator challenge/reversal and renewal must be tested before public cutover; local contract tests do not prove those external procedures.

No frame archive is added. V1 to V4 replay retention, financial claims, payments, vaults, tournament registrations and encrypted notebook data are unchanged. Server contacts are a different feature from the encrypted notebook.

## Rollout and rollback

1. Restore write access to the public GitHub repository, audit the exact publication diff and publish the candidate commit.
2. Ask the Interlude operator to demonstrate renewal of the same delegation and continuing service at the same application address. `ship` is not a renewal command. Do not create new applications to work around an operator's active-delegation limit.
3. Back up the relayer database and the current release manifest privately. Keep the previous web and relayer images by explicit tags. Apply the additive coordinator tables without dropping old tables.
4. Supply the rooms manifest and admission signer through the existing private deployment configuration. Keep `ROOMS_ADMISSION_ENABLED=false` and `PONG_ROOMS_HOME=false` initially.
5. Validate two active games, a queued third, natural seventh-point completion, publication, renewal, reconnect and restart using a private service environment. Validate old financial paths independently.
6. Open admission and enable the new homepage only after the gates pass. The previous arcade remains at `/legacy`; old match-bearing homepage URLs bypass the new lobby.
7. For rollback, close new admission first. Keep the rooms coordinator available for active rooms while returning the homepage to the prior UI. Retain all `il_*` tables and transaction journals. Do not restore an old database backup over newer game results or financial transactions.

## Test commands

Run contract tests and TypeScript checks locally. Service tests require the isolated VPS network and private PostgreSQL, never the production API. `relayer/src/rooms-server.ts` is a test entrypoint which does not start V4 relaying or payment workers.

```sh
forge test --root contracts
node --import tsx --test tests/rooms.test.ts
node node_modules/typescript/bin/tsc --noEmit
node --import tsx scripts/differential-interlude.ts
ROOMS_TEST_API=http://rooms-api:4000 node --import tsx scripts/rooms-integration.ts
ROOMS_BROWSER_TEST=isolated-vps node scripts/rooms-browser.mjs
```

The browser harness preserves the HTTPS `pongit.xyz` origin for virtual PRF authenticators while routing all site/API/WebSocket requests to private test containers. It does not submit production V4 transactions. Physical passkey devices and actual operator challenge/renewal are separate validation items.

## Validation record, 8 September 2026

The [machine-readable validation report](validation/interlude-rooms-2026-09-08.json) records 112 passing contract tests, 40 TypeScript tests, 10,000 matching physics cases, eight-member rotation, concurrent arenas and the HTTPS browser flow. In the final 50-command VPS sample, median SDK response was 23.6 ms and p95 was 39.4 ms. These are engine responses, not Monad finality measurements.

The coordinator restart probe preserved the authenticated session and original idempotent room response. An uncertain maintenance receipt was recovered without allocating an additional job. A private database backup was restored into a separate test database.

The candidate is not the public homepage. GitHub still rejects the configured publication credentials with 403. The Interlude operator currently advertises a 24-hour maximum delegation and has reached its eight-delegation limit; same-application renewal has not been demonstrated. Do not announce a public rooms launch before these gates are resolved.
