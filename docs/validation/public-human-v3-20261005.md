# Public human migration to Interlude v3, 5 October 2026

This is a continuation of the PUBLIC human deployment, not an import from any private qualification season. Deployment is complete; hosting, public cutover and real play remain to be verified below.

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

## Outstanding before completion

Verify canonical target/source equality, exact hosting identities and actual publication. Build and switch the human relayer and public web, preserve the shared index bindings, test real Classic/Chaos and human finances, verify historical access, then check public agents/tournaments and all active routes. A deployed contract, open delegation or running process alone is not proof of functional delivery. The scheduled automation remains paused.

Rollback uses the recorded previous image and configuration; it must never restore old databases over transactions or results produced after this migration.
