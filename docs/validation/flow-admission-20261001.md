# Admission and funded result recovery, 1 October 2026

## Authorization and result recovery

The user now authorizes necessary test MON transfers from the supplied PONGIT
reserve without another per-transfer approval. This supersedes the previous
automation instruction prohibiting automatic transfers. Each transfer remains
bounded and idempotent in the original operator journal; unrelated assets,
permissions and signing keys are unchanged.

Operation `flow-funding-20261001:archive-100` transferred 100 test MON from
`0x369158Ac444278541322643E46e0D5b45ac21C4C` to the existing archive signer
`0x38078433f7a63b3e6abdef49a726599d655f42c5`. The canonical transaction is
`0x398226700c80b13c1a532b7c776cc1dce4630559413325160e02a4688a9c9b26`,
block 67128294. Gas cost was 0.002590596 MON; the reserve retained
524.974272676 MON at that block. The one-off funding process exited normally.
See `archive-refill-20261001.json`.

The existing archive service then captured both published results, without
another capture writer or a replayed match. At block 67130314, match 254 on
9b8e/12 is captured at 2-4 and match 255 on 7a45/12 at 0-7. Their result hashes
match the earlier archived proofs. Both remain contestable. The original
browser fixture still FAILS its original deadline; this later recovery does
not change that verdict. See `capture-after-funding-20261001.json`.

Before the transfer, backup `flow-funding-20261001T0138Z` was copied off VPS and
SHA-verified:

- agents.dump: `73410d73aa27ee625f449fd03ba45933bfe2da73ee66880ecf61956c91a1ac6a`
- operator.dump: `10d0206ca9303e73c077a07b20f86f3ffb303935b9027017689557ec5997ba7b`
- runtime.tar.gz: `b0b56b9e18a8ec6060c9ae5c0c83757a4064ec534d505c90b72fabedeefaf706`

## Admission measurements and candidate

The previous real Chaos trial spent about 2.5 seconds in sponsored intake.
Independent measurements reproduce slow configuration reads at 1.4-2.8 seconds.
Increasing the isolated test's CPU quota from 0.5 to 1 core did not improve its
samples consistently; production quotas were not changed.

The automatic multicall timer split the ten authority/admission reads into two
or three RPC calls. The candidate submits one explicit bounded multicall at
the observed block. It preserves every authority, lane count, arena identity,
release-evidence and admission check, plus the final canonical block-hash
verification. Nothing is accepted on a failed member or a cached gate.

Six alternating observations at block 67129864 return identical views. Before:
1,362 / 2,217 / 2,187 ms with two `eth_call` requests each. Candidate:
1,287 / 969 / 1,127 ms with one `eth_call` request each. These small samples
prove request reduction and equal observations, not the end-to-end 8-second
target. See `admission-config-batch-20261001.json`.

The browser candidate checks a saved sponsor operation every 250 ms for its
first five seconds, then every second as before, with one request at a time
and the same 45-second bound. These checks read the operation journal, not
Interlude. Errors and timeouts retain the exact saved intent.

At 01:47 UTC the shared Monad gateway had queued live and historical work;
the primary had recently throttled an `eth_call`. This is a separate RPC
observation, not an Interlude publication or 600-request/second diagnosis.
No provider configuration or human backend was changed.

## Remaining gates

Tournament 12 is still active. Progressive policies and catalogue migration
remain undeployed. The admission candidate needs built-image import checks
and actual browser qualification before its public capability is enabled.
Preserve all previous failed reports and pending operations. Hosted eight-bot
difficulty, finances, full concurrency, publication reserve and the unchanged
24-hour qualification remain required. No full-delivery claim is supported.

## Built-image validation and compatible deployment, 02:08 UTC

Commit `5007c20` contains the bounded multicall and confirmation-observation
changes. Its full-source backend image is
`sha256:bd5e80b4638c8d6a2cdd58a06e045a64af290b2a2338c4bc93e650a6b5991e13`.
The actual image passes transitive role imports without network, keys or a
database. Its PostgreSQL writer regression passes against an isolated database
and simulated loopback RPC: intake races, lost responses, restart, insufficient
gas, separate signer queues, shutdown and eager observation. No chain
transaction is produced by this regression. See `admission-writer-20261001.json`.

Backup `admission-20261001T0202Z` is SHA-verified off VPS:

- agents.dump: `204443173e153fa9238cddcebb8bed5c46c3f0143bce8e99fe37a52ed0e6b156`
- operator.dump: `5260a7d3615b2626838787d581694624704920072e4904e11065e9f20ad0e6c2`
- runtime.tar.gz: `6a5b8f70da7f0a5eab869e8221c59703cfe151eb3b97f744356f43dccdfcba56`

Reader and sponsor adopted that image at 02:03:53 UTC. The operator database,
signers, journals, role resources and all engine/maintenance services are
unchanged. Public config returns 200; an unknown operation returns the intended
404. Both services remain running without module failures or restarts.

The web image is
`sha256:d11306886d0f62926162747c9f543c99632551e32d94ececdbb1a6c530bfb7dd`.
The initial live-loopback fixture FAILED because SSH forwarding was refused;
its report is preserved. Exact HTML/assets captured from the isolated image
then passed 39 Chrome and 39 Edge checks, including mobile, landscape, reduced
motion, touch/zoom, pixel header, countdown, results and replays. These are
synthetic API/engine fixtures, not hosted gameplay proof. The compatible web
update deployed at 02:07:54 UTC. `challengeAdmission` remains absent from the
public manifest; atomic admission is still an explicit browser qualification
override only. No human backend changed.

Rollback: restore only the previous role image references from
`compose.json.bak-admission-5007c20` and/or
`compose.json.bak-admission-web-5007c20`; preserve later runtime changes.
Recreate only the affected services. Never restore old databases or journals
over newly accepted operations.

## Actual catalogue qualification, 02:08-02:16 UTC

The expired virtual-authenticator restore failed before submission: importing
its credentials did not preserve the PRF capability. No match was created.
The failure is retained; this is not evidence of a physical passkey regression.

A fresh virtual-Mera Chrome Classic match 264 completed and published at 0-7.
It survived F5 and 221 executed inputs. Admission including new authentication
took 16.004 seconds. Edge Chaos match 265 reused that valid grant and completed
with publication and F5, but failed the performance gate: admission was 12.521
seconds and the spectator's maximum hold was 516.6 ms. Its local input p95 was
15.8 ms, receipt p95 16.99 ms and frame p95 17.2 ms. These are actual hosted games
with virtual authentication, not physical passkey tests. All original reports
remain unchanged. See `admission-browser-5007c20-20261001.json`.

The trace identifies a repeated 1.916-second capacity check and a two-second
retry before the admitted match binding appeared. The next candidate reuses
only a healthy capacity response received within two monotonic seconds. The
sponsor and contract still verify current gates. Initial binding checks retry
at 250 ms for at most five seconds, respecting any longer remote cooldown;
active-match recovery retains its previous cadence.

The recorded Chaos stream contained an 800-ms processed-state gap. The same
trace reproduces the 516.6-ms spectator hold. Retaining a 500-ms minimum reserve
reduces it to 350.2 ms without extrapolating unprocessed state; player buffering
remains unchanged at 120 ms. This is a recorded-trace regression result, not
yet a new hosted performance result.

Portalled shared dialogs previously inherited none of the cabinet's pixel
palette. The candidate supplies the Pixel Palace frame, square controls and
44-pixel touch targets within the portal. Exact pre-fix fixture fails on its
9-pixel corner radius. Development Chrome and Edge fixtures each pass 44
checks; final built-image checks remain required.

A migration drain setting suppresses only creation of the next tournament.
It preserves progression of the current bracket, challenges and recovery.
It has not yet been activated. No active tournament may be cancelled by this
setting. Progressive policies and catalogue migration remain undeployed.

Candidate verification: 847 Solidity tests pass, eight are skipped; 830
TypeScript tests and root typecheck pass. Twenty playout tests include the
recorded failure. No final 24-hour or complete-delivery claim is supported.
