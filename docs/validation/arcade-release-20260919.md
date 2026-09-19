# Arcade release candidate, 19 September 2026

This candidate is not the public deployment. Public human admissions and Agent Arcade remain closed. The private agent trial started on 18 September completed on its frozen source and dedicated capacity; its service has not been changed by this candidate.

## Assembly

The `codex/arcade-release-20260919` branch combines the human R2 recovery, the gas-bounded rules-8 candidate and the on-chain Agent Arcade strategies. The recovery fixes are preserved, including the operator hold, observations after expiry, uncertain nonces and independent financial finalizations.

The corrected contact semantics use human rules **9** and agent rules **10**. Rules 6, 7 and the already deployed private rules-8 candidate retain explicit historical decoding and projection behavior. The packed snapshot format remains 6; its format number is not the physics rules version.

## Corrected behavior

- Resolve all earliest simultaneous contacts in stable order, including obstacles at force ticks. Revalidate consumed, expired and teleported contacts.
- Expire or activate effects before contacts at the same microsecond. A retired second ball cannot consume a paddle charge.
- Simultaneous hits at opposite paddles retain Hot Potato's prior holder, avoiding a permanent side bias.
- Retry a blocked announcement on the absolute 100 ms game-time grid, not at arbitrary command or gas endpoints.
- A randomness proof arriving during incomplete catch-up advances the state but is not installed at a partial clock. The identical proof can be resubmitted after catch-up.
- Preserve a fast collision search between contacts; allocate the complete candidate set only when a collision actually falls in the current step.

## Local evidence

On 19 September, after these changes:

- TypeScript checking: passed.
- TypeScript tests: **378 passed**.
- Solidity tests, including the new pool and common contracts: **501 passed, 2 skipped**. Skipped tests need the real hub and are not counted as qualified.
- Includes all 276 event pairs, gas-limited catch-up, both multiball goals, force-boundary obstacles, delayed proofs, historical kernel selection and root bytecode size checks.
- Bot command tests retain a **14.8 M execution gas** budget. The longest test sweep was split because the test harness itself exceeded Foundry's total gas budget; the command allowance was not increased.

These are local tests, not evidence of hosted capacity, production availability or the final 24-hour trial. Independent arena rotation, maximum-duration publication/release, browser validation and a new final trial remain release gates.

An isolated VPS run at `b34a088` completed **24,000 Chaos Solidity/TypeScript comparisons with zero mismatches**: 10,000 random, 10,000 simultaneous-contact adversarial and 4,000 historical rules-6 cases. The V2 suite also passed 10,000 Classic and 10,000 legacy Chaos comparisons. The shared kernel is unchanged by the following pool work; admission and pending-control integration still require real execution tests.

The old agent trial ended at 2026-09-19 15:12:57 UTC. Its 1,435 samples measured **66.6899% availability**, with a longest unhealthy interval of about 69.3 minutes. It covered all 24 effects and two simultaneous matches, but cannot qualify this release. Source hashes stayed unchanged. Machine-readable summaries are retained under `artifacts/qualification/20260919` (private evidence, not bundled web assets).

The first isolated deployment of `1d11fb8` was refused by EIP-170 (`CreateContractSizeLimit`): the timeline and complete impact resolver together exceeded 24,576 bytes. They are now separate immutable stateless modules: `ChaosPhysics` 12,350 bytes, `ChaosImpact` 11,033 bytes. A regression checks every kernel module's runtime size. The 94 targeted gas and physics tests passed after this split, without raising the per-command gas allowance. The failed VPS run is retained as `pongit-arcade-physics-1d11fb8`.

## Independent-pool candidate

The candidate now contains the shared Monad catalogue, participation locks, challenge queue, published ratings and tournament contracts, plus independent physics arenas. No admission relies only on a database count. A closed arena remains unavailable until publication, challenge resolution, release and renewal are verified. Construction, private admissions and public qualification are separate gates. The initial common contracts and three private arenas have been deployed; see the subsequent funded-deployment evidence below.

The common contracts freeze tournament entrants and strategy hashes, derive scheduling and tie-breaks deterministically, and validate complete published references before progressing. Local tests cover the four tournament formats, corrections, draw rules, two lanes and epoch reuse. Eight official identities are pinned by registry; display names confer no rights. The eight policies have distinct reaction/placement behavior. VIPER currently aims off-centre without changing the physical bounce rule.

Inputs received during incomplete catch-up now retain progress and queue the latest intention at its actual game-time boundary. The pending controls are packed into unused metadata bits: a regression verifies that publication still fits 64 changed words. `RoomsState` extracts the existing snapshot codec into an immutable linked module to preserve EIP-170 headroom. A concession queued behind catch-up is idempotent and does not rewrite an earlier point.

Remaining implementation gates include qualification scheduling, version-2 SDK/service/UI integration, the human participation lock, deployment and monitoring scripts, and English user documentation. Community strategy bytecode is restricted to immutable pure computation, with external calls, storage and block-dependent inputs rejected. The example build and its qualification must prove that restriction on actual compiled code.

The hub terms read at 2026-09-19 15:23:39 UTC reported maxDelegations 32, a one-hour challenge period, 64 changed words per batch and a 150 M block gas limit. Reserved bond is not a count of available sessions. Pool sizing and worst-case publication/release costs remain unqualified; no public capacity is claimed.

No public manifest has been switched. Private deployment progress is explicitly separated from qualification below.

## Automatic strategy qualification and shared capacity

The catalogue now seals eight identities without pretending they are already qualified. A separate contract selects per-mode friendly trials. It reads published controller decision counters, requires valid responses without invalid ones, and never requires winning. An engine cancellation schedules a retry. Corrections restore the prior qualification and cannot overwrite a newer trial's evidence. After catalogue sealing the operator can revoke qualification but cannot award it in place of that published trial.

The updated full contract run passed **509 tests, with 5 explicitly skipped environment-dependent checks**. The full TypeScript run passed **383 tests**. A further 81 targeted agent tests passed after restricting the operator's qualification authority. These remain local evidence. The immutable pool's dispatch code was split into `PoolPublication` and checked against EIP-170 rather than raising the limit.

The official hub creation bytecode was tested separately, then the same capacity behavior was reproduced on a read-only fork of the **deployed hub at block 63928276**, code hash `0x9380248d1c5debacf028290ca54271acd79f68eedfd91dbc9e605ec19937d8da`. An Exiting delegation still consumes a validator slot until release. No transaction was sent by this fork test. The validator advertises **32 total slots**, shared across its users. This is not a dedicated allocation to PONGIT.

At 16:20:50 UTC the hub still reported a 3,600-second challenge period and a 150 M block gas limit. At least three old, expired PONGIT test delegations remain active in the inventoried addresses; they have not been closed blindly. Reserved stake does not establish the number of available slots. The final arena count and service availability must be qualified against actual admissions and observed full-game/closure durations.

The example strategy compiled without CBOR metadata and passed the runtime opcode verifier (two tests in the separate `strategies` Foundry profile). Version-2 read-only API, signed-intent SDK helpers and a disabled tournament UI are in progress. They are not a public launch. The web build passed with webpack; local Turbopack refused the workspace's external `node_modules` symlink, which is a build-environment limitation, not a passing Turbopack check.

## Private deployment and funding checkpoint

The first private deployment attempt at `8b4698d` installed the physical modules, catalogue, pool, shared ratings, tournaments, challenge and qualification contracts, and sealed the eight official identities. Funding interrupted it before the three arenas. The subsequent completion is recorded below. The catalogue starts unqualified; no successful trial is invented during setup.

| Candidate | Address |
| --- | --- |
| Catalogue | `0xf44577f10a5fe3fd7f76fbca0e95a5fb3454b67c` |
| Pool | `0x10103f05e2dd7bf671cd4b239b534962bf0c0f47` |
| Tournaments | `0xfc45b2aebf4c1d8f086144eb3c208bdfe27a7fa2` |
| Published ratings | `0x7b50ecddf3d544dae9c025a358136a6178d816ce` |
| Challenges | `0xb0d69b867c013216b8a77f56e354b56e2fe6a8f4` |
| Qualifications | `0x1b0c9d605ce1014280f5b78fea2bcf7815651448` |

The next transaction was refused for insufficient balance. At 17:21 UTC, the operator held **0.097424572 test MON**. Pending nonce **1566**, hash `0x0731f0d594249cbee790013e0ae31f57a91a5692cd145d3a9017e5adaad0c389`, remains journaled under its exact original operation. Absence of a receipt is not treated as failure and the nonce has not been replaced. The user was asked to fund the deployment account. The partial private deployment record was copied off the VPS and its hash verified. It contains a private engine key and is not a public artifact.

## Read interface and recovery verification

The latest full TypeScript suite passed **403 tests**. All **81 targeted agent contract tests** passed after sealing the qualification authority. The production webpack build, TypeScript check, SDK bundle/declarations and clean package installation/import passed. The SDK archive SHA-1 is `89aed0b0d8021d8240c237fad91f85505c8127f5`; this is a private candidate package, not an npm publication.

A disposable PostgreSQL instance on the VPS passed fault injection for concurrent hosted creation, atomic lifecycle state/evidence writes, response loss after execution, restart recovery, database nonce uniqueness and old-epoch retirement. These tests used an injected engine transport, not Interlude. The temporary database was stopped after the test and production databases were unchanged.

The version-2 API reconstructs block-pinned catalogue, fixtures, standings, ratings and complete match references. Spectators validate app, epoch, execution chain, rules and participants. Historical matches return their original published result and no replacement node. No spectator key or game transaction is created.

Chrome and Edge each passed **20 captured-build checks**, at 360, 390, 768 and 1440 px plus 844 × 390 landscape. They cover elimination/championship layouts, focus after selection, Classic/Chaos pixel courts, a complete 16:9 court inside the viewport, effect changes without shifting the court, and a transition to the published result. Reduced motion was enabled at 390 px. Two defects found during inspection were fixed: a repeated tournament selection leaving loading active, and a court clipped below the viewport. These browser tests use synthetic API/engine responses; they do not validate passkeys, real matches, physical authenticators, touch input or zoom.

Public human admissions, Agent Arcade and tournaments remain closed. Remaining gates include human challenge/session/sponsor integration, the human participation lock, indexer/replay integration, rules-9 financial validation, complete hosted tournaments, maximum-duration release, actual independent capacity, and a new unchanged 24-hour trial. No new trial has started.

## Signed sponsorship and family reuse

The candidate adds canonical zero-value sponsor routes and tab-local exact-intent recovery, sharing the existing operator journal rather than introducing another nonce owner. The new family helper retains its limited key across F5 and arena rotation. Only confirmed expiry, revocation or replacement requires fresh explicit owner consent; temporary RPC failure never discards the key. Root passkey material is not persisted.

The full TypeScript run now passes **412 tests**, including 9 new sponsor/family tests. A subsequent targeted 11-test run covers lost replies, corrupt replies, 429, simultaneous clicks, foreign targets, administrative/financial rejection, grant expiry and another-device replacement. The TypeScript check and SDK bundle/declarations pass. A separate read-only temporary VPS container passed the HTTP envelope cases: body limits, signature envelope, closed-gate recovery, idempotency and error redaction. Its contract/writer responses are synthetic and it mounted no operator secrets or production database.

This is not a completed human challenge path: the Mera UI, compact arena controls, global human participation, owner-signed active-arena renewal and real cross-arena session reuse still require integration and validation. Community availability currently has no relayed setter in the immutable candidate catalogue; it requires the creator's direct transaction. No sponsor process or new admission flag was activated on production.

The SDK package was rebuilt with these exports and clean-installed again in an isolated VPS container. Its new archive SHA-1 is `088899a84379d936e2bec8003308daa5cbace23a`; the earlier hash above identifies the earlier candidate, not this artifact.

The complete production backup at **20260919T175836Z** was copied off the VPS. The older production script hashes only database dumps, so an additional read-only inventory verified **all 67 files**, including configuration and key files, against the off-VPS copy. The full manifest is retained privately beside it. At **18:13:39 UTC**, the operator still held **0.097424572 MON**, with no receipt for the preserved nonce-1566 deployment transaction. This funding checkpoint was resolved by the transfer below.

## Funded deployment and first real publications

At **2026-09-19 19:20:39 UTC**, the funded operator held **1000.097424572 MON**. The exact nonce-1566 operation was resumed without replacement, confirmed at hash `0x0731f0d594249cbee790013e0ae31f57a91a5692cd145d3a9017e5adaad0c389`, and the isolated deployment exited successfully. The completed private record was copied off VPS with a matching checksum. No production switch was enabled.

Three independent arenas were installed:

| Arena | Contract | First published result | Batches |
| --- | --- | --- | --- |
| 1 | `0xa4f127f53edbaa63f379f0fdec478e50d8fe5dea` | Classic 1–7, 211.498564 s | 279 |
| 2 | `0xda168611985fef4622d12734c4df254425006638` | Chaos 2–4, 300 s | 400 |
| 3 | `0x2edec92e1bab165751192248e6e2a25b4f70e1bc` | Classic 4–3, 300 s | 397 |

The record at **20:03:57 UTC, block 63972922**, verified bytecode hashes, bindings and published results. All three sessions were closing and their results were still contestable. The first release becomes eligible at **20:30:30 UTC**; a timestamp becoming eligible is not proof of a successful release. Later arenas played while earlier ones were closing. The common family is `0xab3104c44c9b9f2368ab147c564427aa1f387c4a`.

The keeper and physics service use frozen source `fe44ef0` in a separate private environment. There were no pending or reverted engine jobs in the post-match sample. The human production and old private trial were not changed. No final 24-hour trial has started.

A public Monad RPC catalogue check returned a **15 requests/s** limit for an unbatched read burst. Grouping compatible reads through Multicall made the repeated check pass. This was a Monad RPC response, not evidence about Interlude's quota. The browser base reader and private sponsor now use the same batching policy.

## Human challenge client candidate

The new client/UI implements remembered Mera account selection, scoped two-hour family reuse, queued challenge restoration after F5, exact arena controls, lost-response reconciliation, owner-signed active renewal/revocation and a result/rematch path. The SDK exposes `createPoolPlayer`. These implementations do not themselves qualify the real authentication path or cross-space participation.

The updated full TypeScript run passed **423 tests**. TypeScript checking and SDK bundle/declaration generation passed. Tests include in-flight direction coalescing, preserved uncertain nonces, exact resend, old-epoch closure, active permission overrides and closing a client during slow recovery. The captured-build browser cases and real human-check harness must be rerun on the frozen version; the latter deliberately uses a synthetic owner and must not be reported as a Mera device test.

On `b056305`, Chrome and Edge subsequently passed **25 captured-build checks each**, including the eight-bot catalogue, preserved connection choice, Escape/focus restoration, non-overlapping mobile header links, both tournament layouts and both pixel courts. This is still synthetic API/engine evidence. The SDK package was clean-installed and imported on the isolated VPS, including `createPoolPlayer`; that archive's SHA-1 is `154f88e09de8499208f65f175dce544e1f824757`.

The real private human challenge was registered at `0x8eb2e96444ee8cbff86b33731a2faf8d93967fb86c34d5353230d4f0ac3e8aa6` for synthetic owner `0xdc4eA0EF1BC2030C371E7fE764E6020e1984ACE2`. It waits for the first released arena. A one-off helper inadvertently replaced the maintenance journal as root, causing EACCES during the waiting period. Ownership was restored to uid 1000, preserving mode 0600 and the journal contents, before release became eligible. The waiting human harness was restarted under uid 1000. New guards prevent this helper mismatch; the engine and production services were not restarted.

Human qualification tools now distinguish rules 8 and 9 in fixture IDs, deployment receipts, manifests, saved signed offers and isolated database names. The existing frozen rules-8 evidence is preserved. Eleven targeted client/version-boundary tests and a further TypeScript check pass; these tooling changes do not claim a rules-9 hosted test has run.


## First releases and reused arenas, 19 September 20:43 UTC

The 279-batch Classic arena was actually released at 20:30:41 UTC, transaction `0x9b03c1cac89c282b9039915cd450fb0a8408523ff9a71708623488959378ef7e`, using 956,907 gas and 0.097604514 test MON. The 400-batch, five-minute Chaos arena was released at 20:37:01 UTC, transaction `0x61b567f731c4bf7edef125d726b0ad8bcf78653ac20a5ccb4848f73a96fd5594`, using 1,066,828 gas and 0.108816456 test MON. These are release fees only, not total game costs. Arena 3 was released at 20:43:29 UTC, transaction `0x26a4bb070f268d9b5faaa45b8ab46f7a94486988aa1e8775e85e8b46819bdd88`.

The first two arenas then admitted new challenges, renewed to epoch 2, executed commands, published 0–7 results and closed again. A pinned-block reader verified that their epoch-1 links retained the original final results and returned no replacement node. A five-minute ordinary Chaos release is therefore proven; six-minute knockout overtime, heavy-input worst-case publication, continuous capacity and a final 24-hour trial are still unqualified.

The synthetic human runs were partial (59 and 28 confirmed direction changes): both games reached 0–7 before the target of 100. Run 1 passed lost response after execution, exact receipt recovery with the stored journal, and an injected pre-execution HTTP 429. Run 2 passed owner revocation and renewal of the same limited key on a different arena. Neither is a physical Mera/browser authentication test. Reports are preserved separately. The harness now distinguishes a terminal result or serve reset from an unaccepted command.

A client inefficiency was corrected: the three-second hub fence no longer rebuilds the entire sender and repeats immutable binding/bytecode/permission reads. Initial or uncertain-state recovery still performs the complete checks; each signed command still enforces its active permission in the contract. Tests cover sequential nonces, closing epochs, failed and reorganized light checks. This updated client requires another real command trial.

A later history collector again exceeded the public Monad RPC's advertised 15 requests/s response despite Multicall. The read-only collector now paces its own requests to at most 2.5/s; the complete history/fee collection then passed. This does not establish an Interlude limit and does not claim that all service traffic has been measured.

The full TypeScript suite after the light-fence/cooldown changes passed **427 tests**, and TypeScript checking passed. The live keeper and engine remain on their frozen `fe44ef0` source; only a separately launched human-check client will use the new version initially.

## Capacity optimization and series candidate, 19 September 22:04 UTC

The third real synthetic human trial completed **100 confirmed direction changes**, median **111.59 ms**, p95 **399.74 ms**, followed by a concession and published 0–1 result. Reference: arena `0xa4f127f53edbaa63f379f0fdec478e50d8fe5dea`, epoch 3, match 7; publication `0x0f818c993882b09479d3869598552ec7f5e74646b77ae84f66b6e898a6eb2213`. This is real SDK/engine evidence, not physical Mera authentication or visual browser validation.

After explicit approval and a five-file hash-verified off-VPS backup, two empty expired predecessors were force-closed. Their epoch/batch counts, active matches, unresolved commands and current production identity were checked first. `0xfd1693294fed77304662f08e827b043b0ba386a3` epoch 3 closed at transaction `0xdec596868fa0939aee6ed4c614ca1ab36fc3352be67f42a3c5cf67ae6358b4f5`; release is eligible at 22:18:50 UTC. `0x065b3d60457eb7c32216d8f64b90f756d51fcfc4` epoch 1 closed at `0xff1770f662c590e04c7f56dc7be5d433eed9d075ee0abea26f2102199b7ea6b7`; release is eligible at 22:19:00 UTC. These deadlines are not release confirmations. Another old application with an active match was left intact.

A new read-only estimate of the older `0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9` epoch-2 release, at block 63993847 / 21:50:21 UTC, still failed for insufficient gas after 8,564 batches. No new transaction was signed for that application.

## Capacity cleanup and rules-9 hosted results, 22:36 UTC

Both empty predecessors were subsequently released. `0xfd1693294fed77304662f08e827b043b0ba386a3` reached hub status None through `0x4445bbfbc102ca0d92ffab89e42f16c7041f3f3336504f062d3e9cb3e2672006`, block 63999590. `0x065b3d60457eb7c32216d8f64b90f756d51fcfc4` reached None through `0x83827d01886a5cc18ee3f4a223241750240b41105b4869abbcadf3122e92673c`, block 63999618. The shared operator nonce journal was retained. No active historical game was discarded.

The previously capacity-blocked human rules-9 candidate `0x0f0438f757b20047de662d6b553f8d37e56348fb` then opened successfully, transaction `0x7e9c8012babfb766094e5e25bbda518cb28a62839ad13ec0f0bd0dfcdaf27d99`, block 64000406. Hosted epoch 1 executed two simultaneous Chaos games to 7–6 and published both results. The trial recorded 50 commands, 43 publications, a maximum publication calldata size of 4,068 bytes and a maximum observed command gas use of 4,433,792. These are observed cases, not worst-case bounds.

A second real trial completed Classic 7–4 with 102 confirmed changes per player, then Chaos 4–7 with 119 and 102 changes. It verified four randomness proofs, realtime bets reaching the pressure worker without a checkpoint pause, and a 0.006 test-MON automatic payout to a synthetic beneficiary without a recipient signature. Its separate contracts are settlement `0x59118327c9d5a3098274b6370f6256a225a3f672`, market `0xe66de12d30a2dc69030120c97ae6f803f22ae332`, and vault `0x1cc5b7d586f93d657a1970fd68351bb50a841535`. Production finance was untouched. This trial uses synthetic EOA owners; browser and physical-device validation remain separate gates.

The bounded-series candidate also admitted its first hosted arena and advanced from a published five-minute Classic match to another match in the same epoch. See `AGENT_SERIES.md`. Public human, Agent Arcade and tournament switches remain closed; no new final 24-hour trial has started.

The [bounded-series candidate](../AGENT_SERIES.md) adds contract-authorized fixture groups, independent game references, per-game capture, stale-transition guards, tournament memory continuity and bounded cancellation of unstarted games. The latest full Forge run passed **536 tests**, with **five environment-dependent tests skipped** and zero failures. The TypeScript suite passed **434 tests** and type checking passed. A disposable VPS PostgreSQL database passed reset coalescing, cumulative restart diagnostics, idempotency, stale-read rejection and seven-day retention. It was removed after the test. Its first harness attempt lacked writable `/tmp`; providing a tmpfs fixed the harness without changing production.

The series contracts and services had not yet passed hosted execution, publication or release at that checkpoint. Later evidence below supersedes this status. No final 24-hour trial or public reopening is implied.

## Browser and grouped-session checkpoint, 19 September 23:10 UTC

Rules-9 browser runs 1 and 2 passed on Chrome and Edge respectively, using the real private coordinator, Interlude and Monad. Classic and Chaos both finished 7–6, with the correct result on both players and a neutral spectator display, including F5. Run 3 also passed both modes with Mera virtual WebAuthn PRF authenticators and injected lost-response-after-execution and pre-execution 429 cases. No extra passkey assertion was requested after creation/F5. Physical authenticator and cross-device recovery are not established by this evidence.

Two earlier runs failed before connecting because the reused private web artifact contained `http://localhost:4000` and the wrong compiled deployment. They created no rooms or game commands. Their reports and private records were retained. Rebuilding a separate web artifact against the exact rules-9 manifests, relative `/api`, correct WebSocket origin and RP ID resolved this fixture error. The public site was untouched. The manifest preparation script now includes both chain IDs and the engine tick duration required by the current web types.

The three completed browser reports and current fixture state were backed up off VPS with three matching file hashes in `rules9-browser-gates-20260919T2305Z`. The first lifecycle rehearsal stopped before signing any closure because only 364 batches had accumulated, below its 600-batch pressure gate. Additional real Classic/Chaos matches were launched to exercise that unresolved gate; the threshold was not lowered to produce a pass.

The old single-match private pool was drained after its three games had completed, using the shared operator journal and a verified off-VPS backup. Its admissions, challenges and tournaments were disabled onchain. The frozen September-18 trial and human production remain unchanged. The first reclaimed arena slot allowed the second grouped-session arena to open. See [the series evidence](../AGENT_SERIES.md) for the six independently captured matches and actual batch counts. Release, renewal and sufficient continuous reserve are still separate gates.

The next source candidate adds challenge priority, cancellation of unopened series without inventing an epoch, rules-11 family/client support and history reads for multiple games in one arena. It passed 101 targeted Solidity tests, the full 439-test TypeScript suite, TypeScript checking and SDK bundle/declarations. No public gates or running frozen candidate sources were changed by these source tests. New hosted challenge integration, full tournaments and the final unchanged 24-hour trial remain outstanding.

At 23:19 UTC the human rules-9 lifecycle rehearsal closed normally with 659 accumulated batches, after further complete Classic/Chaos games and a fresh three-file hash-verified off-VPS backup. The real challenge window ends at 00:19:36 UTC on September 20. Release, renewal and a new epoch-2 published match are not yet established.

The next source also integrates the common pool's verified result log with Envio. Targeted archive tests cover deduplication, multiple arenas/epochs, tournament identity, unstarted cancellation and correction. Code generation and indexer type checking passed in a disposable VPS container with no network or database; this is schema/handler validation, not a live backfill. The new common pool is 29,552 bytes and its arena is 28,855 bytes, within the explicit 32 KiB Monad candidate budget. Movement payloads do not contain those runtimes. Runtime hashes and hosted gates must be qualified for the actual deployment.

The completed integrated source passed **542 Solidity tests** (five environment-dependent skips), **440 TypeScript tests**, TypeScript checking, SDK bundle/declaration generation and the production web build. The generated Envio declaration includes `AgentSeriesArchive` / `SeriesResultRecorded`; its SHA-256 is `681b082004d5f8d6278e967009bad87dea4716833ad08cce95f641462c9658a8`. Human and browser harnesses can explicitly select rules 11; their previous rules-10 reports are not silently relabeled.
