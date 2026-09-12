# Contract-owned lobby and independent physics arenas

Reviewed 12 September 2026. This is the **candidate delivery record**, not an announcement that the public website has migrated. The compatible recovery release continues to run on the current production application. No automatic Monad gameplay fallback is enabled.

## Implementation

The common lobby, participant locks, rooms, invitation index, ranking journal, profiles and encrypted storage live on Monad. Each physics arena has its own immutable game contract, epoch and hosted delegation. A terminal publication frees the participants; reuse of that particular arena waits for final closure. The pool targets two concurrent games and contains at least three contracts so a following game can start while another closes.

| Component | Authority and behavior |
|---|---|
| `IndependentLobby`, `ContractLobby`, `IndependentSocial` | Separate mode queues, bounded deterministic selection, two matching consent grants, one participation per account, eight-member rooms, winner stays, host transfer, absence and rejoin. Ordinary invitations expire after ten minutes; rematches after sixty seconds; duel offers after twenty seconds. |
| `IndependentArena`, `IndependentSurface` | One match per delegation. First to seven; +10% per successful return without a voluntary cap; reset on each point. The generated surface and Solidity/TypeScript physics remain aligned. |
| `ArcadeFamily`, `ArenaAuthorizations` | Two-hour root grant, arena-bound keys, epochs and nonces. A root-signed active revocation is distinct from revoking future admissions. Financial and private-data writes require the owner. |
| `PublishedRatings` | Paged player discovery, separate modes and seasons, existing placement/repeat rules, immutable first publication and ordered corrections. Rebuilds use a new generation and switch atomically when complete. No friendly/cancellation ELO. |
| `IndependentSettlement`, existing V4 market/vault | Monad betting and wallet payments. The first captured publication is frozen for payment; later corrections are recorded without paying twice. Arena expiry does not prevent claiming or retrying a captured debt. |
| Profile and private registries | Owner-claimed name reservations; twelve avatars. Separate encrypted contacts/notebook namespaces, chunked uploads, expected revision and atomic commit. The wallet derivation is unchanged. |
| Relayer | Independent observation, progress, admission, provisioning, financial, indexing and payout workers. The single operator nonce journal and lock remain shared with legacy services. The VPS sponsors rules rather than selecting scores or rivals. |

The Chaos bridge is the explicitly authorized **testnet trust assumption**. It signs paid-MON checkpoints bound to the arena, epoch, match, rally, close block and market. It is not described as a trustless external-state proof. A missing checkpoint holds only that Chaos rally.

The intermission UI distinguishes point publication, preparation of the betting window, forty open blocks, two closing confirmation blocks and preparation of the next rally. It does not call this entire period three seconds.

## Corrections made during qualification

- Room references accept a URL-escaped colon exactly once. Encoded paths, foreign deployments and malformed references fail instead of loading another room.
- An action clicked before the first lobby read verifies the saved family grant. Unknown state does not cause another root passkey ceremony. Account controls do not falsely display renewal during initial synchronization.
- Successful profile saving closes the account dialog. Successful private commits with a lost response are detected on reload; concurrent encrypted uploads have an explicit discard/reload path.
- Forty concurrent intake requests for the same immutable call produce one pending operation even if their maintenance context differs. A submitted uncertain transaction cannot be replaced. Recurring room and Chaos operations carry the state they intend to advance.
- An unpublished current Chaos pause no longer causes repeated attempts to open an older, already-published pause.
- Readability and write availability are separate. A stale readable snapshot cannot hide a publication failure. The failure is retained across a service restart for the affected app and epoch.
- The mobile synchronization banner remains in the layout instead of intercepting the room controls. Recovery state is consistent between the banner and Tools; a prior rally's label cannot be reused for a new pause.
- Reloading a closing or challenged arena reads its pinned Monad snapshot, without contacting the stopped node or enabling commands. A partial published score never becomes a fabricated result. Confirmed cancellations have a neutral, accessible result dialog instead of an ineffective View result action.
- The terminal snapshot remains visible when the room rotates. Historical snapshots are loaded only when the arena, epoch, match, winner and score agree with the ledger. Reused arenas cannot supply another match's replay.
- Root authority remains separate from the limited arcade key. Financial/private operations do not acquire gameplay permissions or vice versa.

## Real hosted qualification

Evening update, 12 September: compact direct controls completed full Classic (0:7, six published batches) and paid Chaos (3:7, eighteen published batches) on the existing v2 candidate contracts. The repeated SDK child-grant envelope is removed only for independent arenas, whose bound family key remains enforced by the contract. A Chaos ABI phase comparison was also corrected. See [payload qualification and limitations](INTERLUDE_PUBLICATION_413.md#compact-commands-12-september-evening). This supersedes the full-game publication blocker observed earlier, without claiming that the entire production migration has happened.

The first candidate rehearsal on 12 September at 11:05 to 11:07 UTC passed:

1. Contract-selected Classic and Chaos matches ran in separate hosted applications.
2. The first result was published and its own delegation closed.
3. The other match still accepted commands.
4. A third match started during the first challenge window, using the same root family grants.
5. All three fixtures were released after their real hub deadlines at 12:08 UTC.

[Rehearsal](evidence/independent/v1-hosted-qualification.json) and [release](evidence/independent/v1-release.json). Seventeen SDK commands from the VPS had p50 115 ms and p95/p99 827 ms. This small controlled sample includes concession and is not a browser or sustained-load benchmark.

A later v2 candidate was exercised through a private HTTPS-origin browser harness using real Mera/Interlude SDKs, real Monad contracts and a private VPS frontend. It passed contract matchmaking, dual consent, unique profile saving, a three-member Chaos room with an automatic spectator, F5 without a new root ceremony, and a root-signed paid Chaos handicap. Virtual PRF authenticators were used. They do not demonstrate physical-device recovery.

**The full natural-game/load gate failed.** Classic stopped at 5:5; Chaos stopped at engine 1:1 while Monad still held 1:0. Both reported the same batch-2 `413 Payload Too Large` commit-relay failure. The input test attempted 100 changes per player; it is not counted as 100 confirmed commands. No complete paid v2 candidate game, winning payout after that game, or real challenge-after-payment is claimed. See the [operator diagnostic](INTERLUDE_PUBLICATION_413.md).

The failed Classic candidate was automatically force-closed after the hub's actual one-hour publication-silence deadline. It was released and cancelled at 14:51 UTC, without awarding a winner or ELO. That operation did not stop the other arena observer. Its unconfirmed commands were retired only after final closure. No missing receipt was treated as failure, and no 5:5 result was turned into a fabricated winner.

The Chaos fixture reached its separate release deadline at 15:35:52 UTC. Its release, cancellation capture and automatic refund then succeeded. The disconnected bettor received exactly **0.003443407699269404 MON**, with one transfer attempt, in transaction `0x1598637ead37bb347a494ff7f905220ca3d5bad763e24c0c7ae44bb6ff37ad53`, block `61936869`. Its balance changed from zero to that exact amount without a beneficiary transaction. Read-only simulations of both a duplicate claim and a retry rejected with contract reverts, not transport failures. Both cancelled games have no winner or ELO change. [Receipt and balance proof](evidence/independent/refund-proof.json), [release and command-journal evidence](evidence/independent/v2-release.json).

All three v2 fixture delegations are released and no unresolved engine command remains. The isolated service and frontend containers were stopped and removed at 15:37 UTC, after those checks. Journals and private evidence were preserved; production containers and volumes were not removed. This successful cancellation/refund path does not turn the interrupted games into successful complete-game qualifications.

Final backup `20260912T153812Z` includes the recovered operation journals and private qualification logs. Its database dumps and qualification archive were copied outside the VPS and their checksums verified. The private logs follow the backup's seven-day retention. Removing the stopped fixture's build cache reduced final disk use to 76%; no temporary qualification service remains running.

## Validation record

| Check | Evidence and limit |
|---|---|
| TypeScript | 146 tests pass; type check passes. Includes publication-error persistence, old-pause rejection, pinned closed-arena recovery, versioned references and epoch/replay isolation. |
| Solidity | [227 tests across 20 suites](evidence/independent/contracts-final.txt), optional external fork suite excluded. Includes grants, race protection, solvency, exact ELO, correction generations and inherited same-day opponent counts. |
| Physics | [10,000 Classic](evidence/independent/classic-physics.txt) and [10,000 Chaos](evidence/independent/chaos-physics.txt), no mismatches. |
| Real lobby | [Twenty decline/expiry cycles](evidence/independent/lobby-cases.json) across both modes. Duplicate submissions were replayed; this is not twenty full games. |
| PostgreSQL intake | [Forty concurrent calls](evidence/independent/writer-regression.json) deduplicate; uncertain bytes survive; invalid signatures and RPC failures are not accepted. Isolated schema and simulated RPC; no new signing. |
| Indexer | Envio 3.9 Linux codegen and TypeScript pass. [Real canonical block-hash query](evidence/independent/indexer-read.json) matches the exact entry decoder. This does not qualify a mainnet reorganization. |
| Responsive layout | Three home choices tested at 360, 390, 768 and 1440 px, plus landscape. Full sustained render/latency comparison remains blocked by the hosted failure. |
| Real recovery UI | [Saved-session browser test](evidence/independent/recovery-browser.json): recovery state persists through successful reads and F5; Tools/Escape/focus work on five viewports; docs open separately without game RPC. |
| Closed-node recovery | [Real closed-arena reload](evidence/independent/closed-arena-browser.json): partial published state remains visible on five viewports, controls stay disabled and no request reaches the stopped hosted node. No new root ceremony. |
| Compatible frontend | [Chrome](evidence/independent/compatible-chrome.json) and [Edge](evidence/independent/compatible-edge.json) exercise the compiled frontend with simulated business/RPC responses, including 429, lost responses, next-match recovery and cancellation. These are not real hosted Edge games. |
| Exact release image | The production Docker/Turbopack build passed the same four scenarios on [Chrome](evidence/independent/release-chrome.json) and [Edge](evidence/independent/release-edge.json). Both use the exact frontend bytes with simulated business/RPC faults. |
| Public post-deployment checks | [Chrome](evidence/independent/public-after-chrome.json) and [Edge](evidence/independent/public-after-edge.json): HTTPS home at 360, 390, 768 and 1440 px, three visible choices, menu/Escape, direct docs and a real article 404. Read-only checks; no user session, queue or transaction was touched. |
| Private data | [Real encrypted-write browser test](evidence/independent/private-browser.json): owner-signed commit, lock, F5 and same-passkey decryption, no test plaintext in local/session storage, disconnect cleanup. One virtual credential; not physical recovery or a live cross-device conflict test. |
| Refund after failed publication | [Real receipt and balance proof](evidence/independent/refund-proof.json): all three epochs released; no unresolved engine command; no cancellation ELO; disconnected bettor refunded exactly once; duplicate claim and payout retry both revert. |
| Browser load | [Trace summary](evidence/independent/browser-load.json): 665 Classic and 1,898 Chaos browser HTTP requests; rolling one-second peak 17 in each run; no observed HTTP 429. Setup/recovery included, VPS and WebSocket traffic excluded. |
| Dependencies | Root production dependency audit reports zero known vulnerabilities at validation time. This is not an external security audit. |

No 80% repeated-read or 40% total-RPC reduction is claimed from these aborted, differently timed runs. The candidate reports payload-free browser diagnostics signed by the limited family key; the existing private diagnostics collector retains seven days, separates network/cache/cooldown/WebSocket samples and does not store signatures or keys. In the shared production process one collector owns VPS samples, avoiding double consumption.

[The instrumentation smoke](evidence/independent/diagnostics.json) confirms receipt of browser and VPS samples while an arena was blocked. It predates the added Monad instrumentation on the standalone sponsor path and is not an exhaustive traffic total. Private backups accept at most 65,536 ciphertext bytes; previous notebook payload limits fit within this size, and oversize writes fail explicitly rather than truncating data.

## Candidate addresses

[The v2 public manifest](evidence/independent/v2-deployment.json) lists the tested addresses. These are **test fixtures**, not the addresses used by the main public site.

| Contract | Monad Testnet address |
|---|---|
| Lobby | `0xf2dad62750aab9eab849182b325211145f663174` |
| Family grant | `0x61e397f6282ce15d51e8f8e40b9747d542db540b` |
| Published ratings | `0x88763ea3050dbf72884612ed18ef5c87c9fbe5ea` |
| Settlement | `0xd50924c5e00e73482c477a35d0f88d365a567e10` |
| Market | `0xe00d060d3ee2345693bb293706d5de08c0df82b3` |
| Betting vault | `0xcfe5bb9322a0676f160d288b6e8dea0b9bb56156` |
| Profiles | `0xe4fa0f2e0958a80081a03f3e351e603354c30cab` |
| Encrypted data | `0x77b9dfe0dfe1807c7212cc8e4a3e88ece91af73b` |

The three v2 arenas are `0x4ce249014a54A8260Fe0b8C5A6fde3E0c9c8FfB3`, `0x39259f34e209Cf00D12E1576f9F9eD9CA75ca69A` and `0xf44c1Eb74247547214c1901d981dd5E59601994A`. The later migration-seeding addition to `PublishedRatings` was tested in Solidity but was not retroactively deployed to this immutable fixture. A production generation must be deployed from the final reviewed source with a fresh journal prefix.

## Migration, activation and rollback

1. Keep `PONG_INDEPENDENT_HOME` off until the hosted multi-batch game and finance gates pass. Keep the legacy manifests and URLs. No production manifest is generated by the public evidence file.
2. Before any migration, back up databases, journals, configuration and private recovery files. Copy and verify the backup outside the VPS. The 12 September `20260912T151557Z` backup completed that verification before the compatible deployment. Disk use briefly reached 81% during builds. Old images were identified by the PONGIT package or exact logo digest plus standalone application files, checked for tags and container use, then removed without forcing. Disk use was 79% before deployment and 77% after cleanup. Production, rollback images, volumes and unrelated projects were preserved.
3. Drain the source deployment, recover its published results, and wait for the source hub state to be released. Enable the profile migration freeze before the final snapshot. The read-only snapshot tool refuses a ready export while the source is active or profiles can change.
4. Run `scripts/snapshot-independent-migration.ts` against the verified source storage layout. It checks deployed runtime bytecode, a pinned canonical block, ratings/placements/seasons, same-day opponent counts and name ownership. The current draft contains ten profiles, four rating records and two opponent-count records; `ready` is false because production is still active. Nothing has been truncated or imported into production.
5. Deploy with `scripts/deploy-independent-candidate.ts`, an unused operation prefix and `PONG_INDEPENDENT_SNAPSHOT` pointing to the reviewed ready snapshot. The snapshot digest, source hub state, reservations and linkage seals are checked. Never retry an old deployment ID with different bytecode.
6. Qualify fresh hosted epochs, multiple publications, natural Classic and paid Chaos games, root/family permissions, two simultaneous arenas, third admission during closure, expiry/restart, finality and financial retries. Keep a test failure as a failure. Only then export the explicit public manifest, regenerate the indexer config with its deployment block and enable the new home and services.
7. Both build-time API and WebSocket origins must be HTTPS/WSS production URLs. A direct Next build without these variables uses development localhost defaults and is not a valid HTTPS qualification build. Use the same arguments as the deployment Compose configuration. On the temporary mounted test workspace, `next build web --webpack` is used because the runner's external node_modules symlink is unsupported by Turbopack; the compiled application is still a production build.
8. Preserve old tables and operation journals. New schema changes are additive; rollback disables the independent home/admissions and restores the previous image. It must keep independent observers/payments running for any already admitted matches. Do not send old links to another deployment, transfer legacy funds or drop the new tables during rollback.

The isolated service runner requires a manifest explicitly marked `production:false`; it cannot run against a production manifest. Test services are temporary and admissions are disabled during fixture cleanup. Private credentials and unfinished encrypted uploads remain outside Git.

The production application remains `0xfd1693294fed77304662f08e827b043b0ba386a3` on the compatible recovery release. [Its recovery and real legacy payment evidence](RELIABLE_SESSIONS.md) must not be confused with the new candidate's incomplete qualification.

## Compatible public deployment

The compatible frontend was deployed on **12 September 2026 at 15:24:32 UTC** from commit `8092800ed918795315de6edcf54a5ac6dfc66b1e`. Its image is `pongit-web:recovery8-8092800`, digest `sha256:4c6c2336867d6385c8b2da81b637a3c47225d8f7d3c5c8043bcc9a43f0c15bf9`. The exact production build, not the temporary webpack harness, was used.

Only the web container was replaced. The corrected `pongit-relayer:recovery7` remains at `sha256:80f81b4ae62f0e357c84e5983c74a21ff647fd5d55c720c2394769dec22cb95c`. The three active deployment manifests were compared byte for byte with the previous release. The independent candidate is absent from this release's deployment directory and `PONG_INDEPENDENT_HOME=false` is explicit in the Compose override.

One transient 502 occurred during the web container replacement; the retry then succeeded. Public home, docs and health checks passed. Health reported the current application at epoch 2 with admissions open and no payment-worker error. These observations establish availability at deployment time, not uninterrupted future service.

For rollback, the previous source release remains at `/opt/pongit/releases/ba5305072c47855fe87cd259491c2af1638c5ae1`, with `pongit-web:recovery7` retained. Restore that release's `current` symlink atomically and run `docker compose up -d --no-build --no-deps web` from that directory. Keep the recovery7 relayer and all journals. No database rollback or contract redeployment is part of this compatible web rollback. Later evidence-only commits do not change these runtime image digests.
