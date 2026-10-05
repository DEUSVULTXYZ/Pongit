# Public human migration to Interlude v3, 5 October 2026

This is a continuation of the PUBLIC human deployment, not an import from any private qualification season. Human Classic and Chaos are now open on Interlude v3. Actual public Chrome Classic and Edge Chaos matches completed, including F5, controls, spectators and a disconnected beneficiary payment. Public evaluation is authorized; the final unchanged 24-hour qualification is not claimed.

## Preserved state and boundaries

Source lobby `0x5DbEA9692D443E04E1bd0B74fB307B079a5cb212`, snapshot block `68288853`: 25 final results, 16 rating rows, six repeat-counter seeds, two empty slots, no reserved matches, no pending sponsored operations and no unsettled indexed bettors. The original genesis remains unchanged. Old rooms and their membership/history remain at their original lobby; signed commands are not replayed into a different domain.

The family (`0x9160FaF0673363998Ffc56fdbBF1486fefFc1E6B`), profiles and private-data contracts are reused. No private data or active authorization is copied or widened. The old vault/market remain available for owner-authorized withdrawals and settlement. Historical API requests carry the original lobby, and replays keep their full arena/epoch/match reference.

New lobby `0x527ccb705048820694a4ac209f83528db68fff3f`, ratings `0x02c58a7771dfd6237b7e80750a1f2f9af141ad48`, market `0xd29dfc7969632cf8f5c806f306aff7c162ad0c02`. The complete public addresses are in `deployments/independent-v3-20261005.json`. New human arenas use hub `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e` with owner-consent hosting and an independent two-match human capacity.

Deployment used the original `pong_relayer/il_lifecycle_jobs` journal and advisory lock 701340. Its bounded container exited zero. Initial openings are a separate bounded operation. Existing agent maintenance retains ownership of its own arenas; no additional agent driver was started.

## Compatibility changes

- Historical human manifests are explicitly allowlisted; unknown or duplicate lobbies fail closed.
- Prior numeric room/match ids cannot resolve against the new lobby by accident.
- Recent replays aggregate namespaces while retaining the exact original replay route and rules.
- The financial service continues old settlement/retry observation. Only withdrawals, claims and retries are accepted on old money contracts; no old admissions or new bets reopen.
- A wallet selector exposes old human betting credit separately from the new vault.
- A previously journalled old request remains observable. A never-accepted old lobby request is explicitly rejected, allowing the saved browser intent to resolve without recreating it against new contracts.
- The web CSP now derives exact v3 HTTPS and WebSocket origins from the same validated manifest as the SDK.

## Verification

- 25 targeted Solidity tests passed: provisioned arena (5), no-lease human (7), lobby (4), settlement (9).
- 15 targeted TypeScript checks and root TypeScript passed before the initial openings.
- All 27 deployment artifacts passed runtime/creation/library-graph checks. Forge found no changed Solidity sources.
- Pre-migration backup contains full human and original-operator DB dumps, source snapshot, private runtime inventory and configurations. All five files (49,350,057 bytes) were copied off VPS and SHA-256 verified. Manifest: `a2e50353b05b7c26fa463d14a93e14e23e3cac171280ed4a6561194c1d2f7071`.
- Remote root: `/opt/pongit/releases/human-v3-20261005`. Off-VPS root: private backups `human-v3-20261005/backup-before`.
- First snapshot attempt rejected the sentinel queue id as a room; no mutation occurred. The corrected snapshot excludes only the exact max-uint queue sentinel, preserving all real rooms.

## Public cutover and preservation evidence

The canonical preservation audit passed at block `68298199`: all 16 imported ratings and six repeat counters match the pinned source, migration is sealed, and all 25 previous results remain unchanged. The family, profiles and private-data contracts retain their original code and addresses. An audit of 621 confirmed social commands found no block preferences requiring import and no pending invitations. Earlier failed audit tooling attempts remain preserved.

The relayer runs image `sha256:1f71055be3b91b8fcc6be8bb73a3e88bcff62ca25cff720ab057e7c0d2c2492b` from product commit `850f040`. All three new engines passed actual identity and epoch checks. The final public web, built from `6c64b0a`, runs image `sha256:93d7a3f64523813810b3aa963539822aa450e76c56d36d7205b6689ac8d406e4`; it includes historical routes, wallet selection, exact v3 CSP and current contract documentation. Human admissions opened after the preservation audit and review of the exact v3 hub runtime. The existing 16,000-batch fork release proof matches the current hub bytecode; it is not a hosted throughput or 24-hour proof.

- Public Chrome Classic `browser-v3oct5c`: passed at 03:55:57 UTC, three Mera accounts, countdown, F5 without another permission, controls and matching 7–6 player/spectator result.
- Public Edge Chaos `browser-chaos-v3oct5e`: passed at 03:58:56 UTC, 304/294 accepted controls, F5 and matching 7–6 result. Match `340282366920938463463374607431768211464` paid 0.006 test MON automatically to its disconnected bettor. Transaction `0xff39d7cdd710f2721aed3fd0e1418ae0d5ad568f3484bcd4e782b78a282c86f5` is retained with the payout evidence.
- Public Chrome NOVA `catalogue-public-v3-oct5`, match 696: published 1–7, 220 confirmed input observations, local input p95 17 ms, confirmed input p95 17.04 ms, maximum unexplained player hold 200.2 ms and spectator hold 83.7 ms. The single resume follows the deliberate F5. Admission took 15.984 seconds and **fails** the 8-second target.
- Public Edge Chaos NOVA `catalogue-public-v3-oct5-chaos`, match 703: published 1–7, 219 confirmed inputs, local input p95 16.1 ms, confirmed input p95 17.63 ms, maximum player hold 183.2 ms and no observed snapshot jumps. F5 recovery passed. Fresh-session admission took 13.604 seconds and **fails** the 8-second target.
- Public Chrome NOVA with the existing valid session, `catalogue-public-v3-oct5-reuse`, match 706: admission **7.405 seconds**, 220 confirmed inputs, confirmation p95 **16.99 ms**, maximum player/spectator holds 166.7/150.1 ms, no observed jumps or input mismatches. Every enforced performance check in that bounded trial passed. One admission sample does not establish an admission p95 across players.
- Browser authentication uses virtual PRF authenticators. These are actual public games, not physical passkey or mobile-device qualification.
- The first synthetic combined driver remains failed: Classic completed, but Chaos encountered an internal transport error. Its two uncertain nonces were resolved only by exact-hash receipts, and its later published 7–2 result is not relabelled as a passing driver.

The additive human indexer uses schema `human_v3_20261005` in the existing shared index database. A backed-up view migration preserves every one of 1,192 prior rows and adds the four new public human results. Actual Hasura GraphQL returns those four rows. Existing last-three replay retention remains downstream of the same view. The human emitter generator now groups repeated aliases without shadowing older ledgers.

Public tournament 35 was waiting because its dedicated admission signer held only 0.009568694 test MON. The original operator journal transferred eight test MON to admission and two to archive; the existing admission worker then started fixture 8 as match 697. Another 25/25/20 test MON were redistributed from the existing owned maintenance reserve to admission/archive/operator under the same signer authority and allowlisted journal. All five transfers are confirmed and must not be repeated. The tournament advanced to 16 of 28 fixtures by 04:36 UTC and remains in progress. No new tournament controller, duplicated nonce or replayed fixture was introduced. Funding attempt 1 failed before process startup on a read-only bind mount and is retained.

The three empty old human epochs were retired normally by the sole bounded worker `pongit-public-human-v2-retire-20261005`, which exited zero at 04:39:29 UTC. Independent canonical verification at block **68308419** confirms `None` for all three applications, their exact epochs 63/64/62 and finalized root `0x2733e50f526ec2fa19a22b31e8ed50f23cd1fdf94c9154ed3a7609a2f1ff981f`, count zero. No game was force-closed and no old epoch reopened. These releases must not be repeated. This proves delegation release, not deletion of every historical Fly machine.

The obsolete `pongit-agent-public-keeper` was stopped after verifying both old admission gates closed, two empty lanes and no pending maintenance jobs. Its restart policy is disabled; its database, journals and history remain intact. Current agent services continue on v3 hub `0x98922c6E5e4Bea62761C71D2401c7ec2c26eC43e` with pool `0x1f7d8a7b470a724df48d1b72723d7782d8e6014a`, four independent friendly lanes and one tournament lane. Agent source `ffd9884` and image `sha256:cec312301e5d7e9bfead34f1cc14aeb3949e34bdff6275f5770b8ab870b4b743` were preserved.

## Browser, finance and history acceptance

- Chrome and Edge catalogue checks passed at 360, 390, 768 and 1440 px: pixel frames, eight portraits, 44 px controls, mode selectors, no horizontal overflow or JavaScript errors. The final web differs from that tested build only in published documentation.
- Actual agent replay 696 played in Chrome and Edge at 360 and 1440 px, with 210 frames and the correct 1–7 result.
- Actual current and historical human replay playback passed in both browsers. The old room resolves to its original archive, the old withdrawal view remains available without new credit admission, and returning to the current lobby works. These history checks performed no writes.
- The disconnected human beneficiary received exactly 0.006 test MON at the payment block. Duplicate claim and retry both revert at the contract, rather than merely failing an RPC request.
- The final public smoke check returned HTTP 200 for home, agents, tournaments, contract docs and health. At 04:47 UTC all three new human arenas were available with sponsorship, human admissions were open, and agents/tournaments were enabled with five lanes on the same v3 hub.
- Root TypeScript passed after the final operational-tooling change. Nine targeted history/index/CSP tests passed, in addition to the earlier 15 TypeScript, 25 Solidity and 27 artifact checks. Documentation generation and the final Next build passed. This is not a claim that a new full test suite ran after every evidence-only edit.

The compact browser proof is `public-human-v3-browser-20261005.json`. Canonical release, runtime inventory, preservation, finance and backup/restore evidence are in `public-v3-20261005-evidence/`. Full browser reports, screenshots, failed attempts and private authenticator data retain their original artifact/private-backup locations.

## Final backup and rollback

The post-retirement backup contains five custom PostgreSQL dumps (human, original operator, current agents, previous agents and shared index) plus the private configuration archive: six files, **71,983,972 bytes**, manifest SHA-256 **4138c8b4409dca5a04109984aa68301662674d82e9338e9e887f38a543414399**. Every file was copied off VPS and verified. All five dumps were uploaded back from that verified Windows copy and restored sequentially into an isolated PostgreSQL container; restoration passed at **04:44:15 UTC**. Checks preserved all 25 old human results, four new human results, five confirmed reserve transfers and 1,207 shared indexed results. Only successful scratch databases were dropped. The restore container exited zero without OOM; input dumps, logs and container remain retained.

Remote backup: `/opt/pongit/releases/human-v3-20261005/backup-final`. Off-VPS copy: `C:/Users/wwwle/.codex/private-backups/pongit/human-v3-20261005/backup-final`. Proof sidecars created after the backup are copied separately with hashes. No secret-bearing configuration or dump is published in Git.

Web rollback uses the compatible v3 image `sha256:e2ba30c3c5c69a164079e492b52ad6badb7ffbfc3ba26a3f25d0452ba2f3f97b` (source `e3ef6eb`), with current v3 manifests and existing databases. The current human relayer `850f040` is the compatible v3 backend baseline. Disable admissions if a backend rollback cannot preserve those contracts; do not reactivate retired v2 admissions. Do not restore backup databases over transactions or results produced since the snapshot. The prior vaults, contracts and withdrawal rights remain addressable.

## Delivery boundaries

Active public PvP, agents, tournaments, API, index/history, replays, human finance and documentation now use the v3 deployment while retaining historical addresses. The remaining performance limits are explicit: fresh-session admission measured 13.6–16 seconds, and the passing 7.405-second reused-session trial is one sample. Physical passkeys/mobile hardware, continuous seven-match capacity and a final unchanged 24-hour availability trial are not certified by these checks. Public `qualified` remains false. The user-authorized public evaluation is live; the scheduled qualification automation remains paused.
