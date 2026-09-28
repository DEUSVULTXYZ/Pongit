# Animated waits and reusable bots — 29 September 2026

## Release status

This candidate is **not deployed**. The approved release still requires one coordinated cutover after the remaining real-game gates and an unchanged 24-hour qualification. No production service, contract, database, delegation or admission flag was changed during this work.

The public API still advertises version 4, two matches, no `houseInstances` capability and an unqualified testnet preview. Its pool is `0x708e32a09a1f5c0d4de2477793a7d6e8d9c1b8e5`. This explains why a tournament still reserves official bots on the public site. Changing a label cannot remove this immutable contract restriction.

## Candidate changes

- A shared Pixel Palace progress panel replaces plain waiting messages in agent challenges, sponsorship, tournament loading, arena preparation, replay loading, human matchmaking, connection and payment actions. It uses segmented cyan/violet CSS animation and a pixel ball. Unknown duration has no numeric progress; measured quantities must be explicitly supplied and valid. Errors stop the loading animation. Reduced motion retains static information.
- Queued challenges expose additive structured presentation data: `progress.stage`, `progress.revision`, `progress.observedAt` and optional measured quantities. Revisions change with the observed challenge state, not every read. Existing responses and historical references remain compatible. Sponsorship presentation follows operation statuses rather than parsed error messages.
- Cancellation requested during another action waits for that action to resolve. It is bound to the original challenge or human queue, so it cannot cancel a later participation. Existing immutable signed-operation journals and nonce reconciliation remain authoritative.
- Connection messages overlay the court rather than resizing it. Replay failures offer an explicit retry. A confirmed engine clock of zero now starts the three-second countdown instead of being treated as missing; an expired countdown never enables game controls itself.
- House archetype isolation remains implemented by the existing five-lane candidate, not by bypassing the legacy tournament lock in the UI. Four friendly copies have independent state and remain separate from the competitive identity and ELO. Community agents remain exclusive.

## Validation

- **752 TypeScript tests pass**, including progress validity, stable challenge revisions, zero-clock countdown, saved sponsorship, old references and house eligibility. Evidence: `artifacts/qualification/20260929-typescript-2.log`.
- **144 targeted Solidity tests pass** across seven suites. The five-lane suite includes all 120 capture orders for four friendly copies and one tournament participant, repeated captures, separate ratings and operational exclusions. Evidence: `artifacts/qualification/20260929-instances-contracts-1.log`. These are local contract tests, not a new hosted concurrency qualification.
- Production UI build 5 succeeds. Root TypeScript checking succeeds. Browser evidence is recorded against this build with synthetic APIs; it does not establish hosted admission latency, physical passkey behavior or uninterrupted engine availability.
- Browser progress run 2 passed Chrome and Edge at 360, 390, 768, 1440 and landscape 844 pixels. It verifies animation, reduced motion, no invented percentage, measured segments, stable panel height, restored requests, accessible cancellation and non-animated errors. Its screenshots and videos are retained. Run 1 failed because the fixture supplied an invalid zero qualification hash; the failed reports remain preserved.
- Final build-5 browser runs pass: **10 progress scenario groups** (five per browser) and **68 page checks** (34 per browser), including all three countdown digits, catalogue, both tournament layouts, Classic/Chaos courts, reduced motion, touch emulation, 2x zoom, replay controls, focus and result display. Evidence: `artifacts/qualification/20260929/progress-3` and `ui-2`. This is browser qualification with synthetic APIs, not seven concurrent hosted games.

## Funding and remaining gates

At **28 September 22:44:00 UTC**, canonical block **66527633**, the shared Interlude publisher `0xB28E684815b095aB5Fb324214cfEa63d76F3d691` still held **16,463.974185383116930335 test MON**. The previously requested two-million-test-MON reserve has not arrived. No automatic transfer or new private opening was made. The earlier measured five-arena daily projection is approximately 1.7 million MON, not a guaranteed cost or a measured full day.

The seven private September 28 delegations remain released according to the preserved canonical recovery audit. Their completed workers must not be restarted. The private fresh-season pool is not a public migration target.

Remaining real gates include the two championship formats on the final candidate; five agent games alongside two human games; worst-case publication and release reserve; real admission through the browser catalogue; final migration and financial verification; and the unchanged 24-hour run. Earlier bounded hosted proofs remain evidence of those scenarios only. See [the recovery and qualification checkpoint](fluid-release-20260928.md) for the exact private paths, stopped roles, backup hashes and sole operator journal.

## Publication and rollback

Publish this reviewed source without changing public gates. Once the remaining gates pass, preserve canonical identities, ratings, repeat counters, requests, sessions and historical routes during the final migration. Deploy the new authorities, services, API and UI together after draining admissions. Service rollback must retain all newly written operations and results; never restore an old database over current journals. The existing off-VPS recovery backups remain unchanged by this local UI work.
