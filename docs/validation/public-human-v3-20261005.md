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

## Evidence so far

- 25 targeted Solidity tests passed: provisioned arena (5), no-lease human (7), lobby (4), settlement (9).
- 15 targeted TypeScript checks and root TypeScript passed before the initial openings.
- All 27 deployment artifacts passed runtime/creation/library-graph checks. Forge found no changed Solidity sources.
- Pre-migration backup contains full human and original-operator DB dumps, source snapshot, private runtime inventory and configurations. All five files (49,350,057 bytes) were copied off VPS and SHA-256 verified. Manifest: `a2e50353b05b7c26fa463d14a93e14e23e3cac171280ed4a6561194c1d2f7071`.
- Remote root: `/opt/pongit/releases/human-v3-20261005`. Off-VPS root: private backups `human-v3-20261005/backup-before`.
- First snapshot attempt rejected the sentinel queue id as a room; no mutation occurred. The corrected snapshot excludes only the exact max-uint queue sentinel, preserving all real rooms.

## Public cutover and preservation evidence

The canonical preservation audit passed at block `68298199`: all 16 imported ratings and six repeat counters match the pinned source, migration is sealed, and all 25 previous results remain unchanged. The family, profiles and private-data contracts retain their original code and addresses. An audit of 621 confirmed social commands found no block preferences requiring import and no pending invitations. Earlier failed audit tooling attempts remain preserved.

The relayer now runs image `sha256:1f71055be3b91b8fcc6be8bb73a3e88bcff62ca25cff720ab057e7c0d2c2492b` from product commit `850f040`. All three new engines passed actual identity and epoch checks. The public web built from that commit admits their exact HTTPS and WebSocket origins. Human admissions opened after the preservation audit and review of the exact v3 hub runtime. The existing 16,000-batch fork release proof matches the current hub bytecode; it is not a hosted throughput or 24-hour proof.

- Public Chrome Classic `browser-v3oct5c`: passed at 03:55:57 UTC, three Mera accounts, countdown, F5 without another permission, controls and matching 7–6 player/spectator result.
- Public Edge Chaos `browser-chaos-v3oct5e`: passed at 03:58:56 UTC, 304/294 accepted controls, F5 and matching 7–6 result. Match `340282366920938463463374607431768211464` paid 0.006 test MON automatically to its disconnected bettor. Transaction `0xff39d7cdd710f2721aed3fd0e1418ae0d5ad568f3484bcd4e782b78a282c86f5` is retained with the payout evidence.
- Public Chrome NOVA `catalogue-public-v3-oct5`, match 696: published 1–7, 220 confirmed input observations, local input p95 17 ms, confirmed input p95 17.04 ms, maximum unexplained player hold 200.2 ms and spectator hold 83.7 ms. The single resume follows the deliberate F5. Admission took 15.984 seconds and **fails** the 8-second target.
- Browser authentication uses virtual PRF authenticators. These are actual public games, not physical passkey or mobile-device qualification.
- The first synthetic combined driver remains failed: Classic completed, but Chaos encountered an internal transport error. Its two uncertain nonces were resolved only by exact-hash receipts, and its later published 7–2 result is not relabelled as a passing driver.

The additive human indexer uses schema `human_v3_20261005` in the existing shared index database. A backed-up view migration preserves every one of 1,192 prior rows and adds the four new public human results. Actual Hasura GraphQL returns those four rows. Existing last-three replay retention remains downstream of the same view. The human emitter generator now groups repeated aliases without shadowing older ledgers.

Public tournament 35 was waiting because its dedicated admission signer held only 0.009568694 test MON. The original operator journal transferred eight test MON to admission and two to archive; the existing admission worker then started fixture 8 as match 697. No new tournament controller, duplicated nonce or replayed fixture was introduced. Funding attempt 1 failed before process startup on a read-only bind mount and is retained.

The three empty old human epochs are being retired normally by the sole bounded worker `pongit-public-human-v2-retire-20261005`. Their actual release times are 04:38:49–04:39:00 UTC. This worker never force-closes a game or opens another old epoch; final canonical release still needs verification.

## Remaining verification

Verify the final compatibility web build, actual historical routes/replays, renewed tournament progression and all three old epoch releases. Refresh and SHA-verify the final off-VPS backup. Admission latency remains above target and continuous 24-hour availability is unqualified. The scheduled automation remains paused.

Rollback uses the recorded previous image and configuration; it must never restore old databases over transactions or results produced after this migration.
