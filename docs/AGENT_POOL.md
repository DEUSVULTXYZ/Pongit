# Agent Arcade independent-pool candidate

This is implementation and qualification documentation, not a public availability announcement. The human game and Agent Arcade admission switches remain closed. No arena in this candidate belongs to the human deployment.

## Contract responsibilities

`AgentCatalog` owns the eight official identities, immutable controller hashes, per-mode qualifications and participation locks. A display name does not identify an official bot. Community controllers are pure contracts, compiled without CBOR metadata and checked by the runtime opcode verifier. External bot servers cannot register as controllers of this generation.

`AgentQualifications` selects a friendly trial against an available house bot. Valid controller decisions are counted in the existing packed brain words. A completed published trial needs at least three valid decisions and no invalid decision; winning is irrelevant. An engine cancellation schedules another attempt and preserves an earlier qualification. A correction of an old trial cannot replace evidence from a newer one. After setup sealing, an operator can revoke qualification but cannot award it in place of this process.

`AgentTournaments` chooses eight available qualified identities by oldest previous participation, then address. Its cycle is Classic elimination, Chaos elimination, Classic championship, Chaos championship. Controllers and starting ratings are frozen for each tournament. A new tournament may begin 60 seconds after completion.

- Elimination has seven fixtures. A tied five-minute match gets up to one minute of sudden death. A remaining tie advances the higher starting rating, then the lower address. This is an administrative advance, with no invented win or ELO.
- Championship has 28 fixtures. Win/draw/loss earns 3/1/0 points. Ties use score difference, wins, starting rating, then address.
- Same-creator games are friendly for ELO but still count in the tournament.
- Corrected results rebuild standings or invalidate descendant fixtures. Old matches and attempts remain addressable. Repair waits for the affected agents to become free.

`AgentArenaPool` assigns the actual arena and binds its participants on Monad before opening a delegation. The candidate uses one match per epoch. An arena returns to admission only after its result has been published, the delegation closed and released, and the previous final record captured. Two lanes separate tournament games from human challenges or qualifications. Waiting challenges do not interrupt a tournament participant. A count in PostgreSQL cannot create capacity.

`PooledAgentArena` runs the shared corrected physics as rules 10, including all 24 Chaos events. Five-minute regulation and knockout overtime are contract rules. House controls run on a 100 ms game-time grid. Community strategy calls have a bounded gas allowance and cannot read future randomness. Invalid answers retain the previous direction and fail qualification. There are no markets, financial pressure updates or local rating copies in an agent arena.

`AgentPublishedRatings` verifies pool-published references and maintains one shared result ledger. Its correction rebuild is bounded and atomic. Draws, administrative advances and human challenges give no ELO. Published results remain visibly contestable until finalization.

## Commands and private services

The private runner has one transport, event feed and nonce journal per arena. The journal is in `agent_pool.engine_jobs`; it is operational evidence, not the source of game results. A lost receipt preserves the exact signed bytes. A generic rejection or HTTP 429 never frees a nonce. Permanent pre-execution refusals require the node's unchanged nonce and remain in the journal. A verified closed epoch makes old commands obsolete without resending them into its replacement.

Controller commands currently use a **14.8 M gas allowance**, matching the local bounded-progress tests. A delayed randomness fetch runs independently of ticks. Each arena can recover without waiting behind another arena's node request.

Run persistent services and every one-off writer with **`--user 1000:1000`**. Private journals are mode 0600 and replaced atomically. A root-run helper can otherwise replace a keeper-owned file with a root-owned one and stop later maintenance. The scripts now refuse the wrong UID. Permission repair does not authorize deleting a nonce journal or making it world-readable.

`scripts/agent-pool-step.ts` is a private qualification operator, not an approved public keeper. It performs a bounded Monad operation through the existing `il_lifecycle_jobs` operator journal and advisory lock. It preserves an uncertain operation before doing another. Publication capture, close and release happen independently of physics. Public admissions and capacity evidence cannot be enabled by this script. Qualification scanning, historical repair scheduling and full service restart tests still need final integration validation.

Hosted creation is journaled before POST, under a PostgreSQL advisory lock. An ambiguous reply is followed by lookup, not another POST. Only an explicit non-creating refusal permits retry. A returned URL must still pass application, epoch, chain and rules checks at the actual node. A five-minute unresolved creation or stale-node identity becomes an explicit intervention state. State and evidence are committed atomically; old epoch evidence is retained separately.

The private keeper scans qualifications and expired waiting challenges with persisted bounded cursors, including identities beyond the first 256 entries. Historical tournament repair waits for participant locks and unchanged controllers, then resumes its original bracket. Pausing admissions does not disable publication observation or release. These paths have fault-injection coverage; full hosted scheduling and sponsor integration remain gates.

## Read interfaces and SDK

The version-2 reader is a separate process with no wallet key. It reconstructs its pages directly from block-pinned Monad reads, verifies the block hash after reading, coalesces requests and returns versioned observations:

- `/agents/config`: configured arenas, common contracts, rules and independently gated qualification status.
- `/agents/catalog`: official and community identities with qualification and participation.
- `/agents/live`: complete assigned references. An assignment alone is explicitly not proof of a live engine.
- `/agents/challenges/:address`: the owner's pending request and exact assigned reference, reconstructed from the contract for refresh recovery.
- `/agents/matches/:app/:epoch/:id`: an exact reference and its published result. Reused arenas do not redirect old links to their replacement games.
- `/agents/tournaments` and `/agents/tournaments/:id`: fixtures, standings and validation state.
- `/agents/rankings`: paginated discovery, pinned-block ratings and rebuild status. Clients must gather all pages at one block before globally sorting ELO and address.

Responses whitelist manifest fields. They cannot expose deployment journals or private key properties. Per-client limits trust forwarded addresses only from explicitly configured proxies, with a separate aggregate limit.

The TypeScript SDK exports `preparePoolRegistration` and `preparePoolChallenge`. They return a signed call rather than silently sending a transaction. Registration binds creator, strategy, metadata, mode, catalogue, nonce and deadline. A challenge binds the limited family grant, agent, mode, queue, nonce and deadline. Both compare their local EIP-712 digest with the contract before requesting a signature. The existing version-1 client must not be pointed at this manifest.

`createPoolSponsor` persists the exact signed intent in tab-local storage before its first POST. On refresh it checks the operation before resending; a lost response, a 429 or an invalid response cannot free the intent. Different actions wait for that resolution. Family grants are scoped to the approved registry and account, reused across arenas, and verified on Monad. Temporary read failure does not trigger signing or discard the arcade key. No passkey secret is stored.

The private sponsor adapter exposes `POST /agents/transactions` and `GET /agents/operations/:id`, using the existing persistent `independent_operations` / `il_lifecycle_jobs` writer and lock. It accepts only canonical signed family registration/revocation, strategy registration and human challenge/cancellation, with zero value. It rejects financial calls, arbitrary strategies and administrative selectors. A closed admission gate still reconciles already accepted operations and permits cancellation/revocation. Simulation happens before persistence; a network failure does not become a confirmed rejection. The read-only process remains keyless; the separate `agent-pool-sponsor.ts` integration harness is explicitly private and has not been started against the candidate.

The candidate now includes the Mera connection/challenge UI, compact human controls and owner-signed active-arena renewal/revocation. They remain subject to real end-to-end qualification. Cross-space participation is still an integration gate. Community availability currently requires its creator's own signed transaction; the immutable catalogue does not contain a relayed availability setter. This limitation must be addressed before claiming a completely sponsored community workflow.

The new tournament page is gated by **both** `PONG_AGENT_POOL_HOME` and `PONG_AGENT_TOURNAMENTS_HOME`. Those switches remain off in production. Match links verify application, epoch, chain, rules and participants. A remembered participant can use its bound limited key; other visitors only observe. Published historical summaries do not connect to a game node. Documentation, tournament reading and spectating do not create wallet sessions or game commands.

`createPoolPlayer` coalesces pending direction changes, persists compact commands before sending and resolves an uncertain command before another nonce. Expiry or a closing delegation preserves the journal; only verified closure retires old-epoch commands. The initial admission is not the sole authorization source: rules-10 override words are read to honor active renewal and revocation. Root permission calls use their own exact journaled payload. Closing a client during slow recovery cannot dispatch the queued movement. The browser holds a per-account Web Lock while controlling an arena and releases input on blur, hidden tabs and dialogs.

The immutable private deployment completed after funding on **19 September at 19:20 UTC**. Three dedicated arenas published their first results: Classic 1–7 at 211.5 seconds, Chaos 2–4 at five minutes and Classic 4–3 at five minutes. They closed independently and entered their real contestation windows. These observations prove initial publication and isolation, not final release, continuous capacity or a passing 24-hour trial. The private human-check harness uses a synthetic owner; its results must never be described as physical passkey validation.

## Capacity and release gates

The deployed hub's validator advertised 32 total delegations on 19 September 2026. A read-only fork of the actual deployed hub proved that Exiting sessions still count towards that total until release. These are shared validator slots, not 32 reserved PONGIT slots. Closing takes the real one-hour contestation window; this candidate does not shorten it.

Three private candidate arenas are intended for the initial isolation test, not as a promise of continuous two-lane capacity. Final sizing must use complete games, worst-case publication/release cost, renewal durations and real accepted delegations. A short-match batch count alone is insufficient.

Still required before public opening:

1. Qualify release, hosted renewal and publication in the following epoch. Deployment, bytecode and first admissions passed; maximum-duration release remains to be measured.
2. Validate the final human rules and finances separately; preserve old balances and contract references.
3. Complete the production keeper, human participation/session integration, sponsor routes, arena UI, replay/indexer and monitoring integration.
4. Complete all four tournament formats on real arenas, with challenges, correction, expiry and restart tests.
5. Run a new unchanged 24-hour trial including renewal and human games in parallel. The older 66.69% trial does not qualify this release.
6. Verify Chrome and Edge, responsive layouts and real session reuse; label virtual-authenticator evidence accurately.
7. Refresh and verify off-VPS backups, publish audited source, then open each space independently only after its gates pass.

No public reopening is implied by a successful compile, local tests, elapsed time or a running container.
